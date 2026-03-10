import type { WorkingTurn } from '../types/index.js';
import type { EpisodicTrace } from '../types/index.js';

export function buildSummarisationPrompt(turns: WorkingTurn[]): string {
  const formatted = turns
    .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
    .join('\n');

  return `You are summarising a conversation history to save token space.
Preserve all tool outputs, errors, and decisions. Drop small-talk and repetition.
Return ONLY the summary text — no preamble.

CONVERSATION:
${formatted}

SUMMARY:`;
}

export function buildLessonPrompt(traces: EpisodicTrace[]): string {
  const formatted = traces
    .map((t) => `Task: ${t.taskId}\nInput: ${JSON.stringify(t.input)}\nOutput: ${JSON.stringify(t.output)}`)
    .join('\n---\n');

  return `You are extracting a reusable "Lesson Learned" from these failed tool executions.
Write a single, concise sentence explaining what went wrong and how to avoid it next time.
Return ONLY the lesson text — no preamble.

FAILURES:
${formatted}

LESSON:`;
}
