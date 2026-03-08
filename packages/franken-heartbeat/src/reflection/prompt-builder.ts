import type { MemoryEntry } from '../modules/memory.js';
import type { Trace } from '../modules/observability.js';

export interface PromptContext {
  readonly traces: readonly Trace[];
  readonly failures: readonly MemoryEntry[];
  readonly successes: readonly MemoryEntry[];
}

const SYSTEM_INSTRUCTION = `You are a self-reflective AI agent performing a scheduled review.
Analyze the provided context and answer three questions. Respond in JSON format.`;

const RESPONSE_FORMAT = `Respond with a JSON object matching this schema:
{
  "patterns": ["string — observed patterns"],
  "improvements": [{"target": "string", "description": "string", "priority": "low|medium|high"}],
  "techDebt": [{"location": "string", "description": "string", "effort": "small|medium|large"}]
}`;

export function buildReflectionPrompt(context: PromptContext): string {
  const tracesSummary = `${context.traces.length} trace(s) in the last 24 hours. ` +
    `${context.traces.filter((t) => t.status === 'error').length} error(s).`;

  const failuresSummary = context.failures.length > 0
    ? context.failures.map((f) => `- ${f.content}`).join('\n')
    : 'No recent failures.';

  const successesSummary = context.successes.length > 0
    ? context.successes.map((s) => `- ${s.content}`).join('\n')
    : 'No recent successes recorded.';

  return `${SYSTEM_INSTRUCTION}

## Context

### Trace Summary
${tracesSummary}

### Recent Failures
${failuresSummary}

### Recent Successes
${successesSummary}

## Questions

1. **What patterns emerged?** Identify recurring issues or trends.
2. **What improvements should be made?** Suggest specific, actionable improvements.
3. **What tech debt exists?** Identify technical debt that can be addressed.

## Response Format
${RESPONSE_FORMAT}

Respond ONLY with the JSON object. No additional text.`;
}
