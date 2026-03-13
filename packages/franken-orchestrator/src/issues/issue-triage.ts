import type { GithubIssue, IIssueTriage, IssueComplexity, TriageResult } from './types.js';
import { cleanLlmJson } from '../skills/providers/stream-json-utils.js';

type CompleteFn = (prompt: string) => Promise<string>;

const VALID_COMPLEXITIES = new Set<string>(['one-shot', 'chunked']);
const MAX_BODY_LENGTH = 16000;

export class IssueTriage implements IIssueTriage {
  private readonly complete: CompleteFn;

  constructor(complete: CompleteFn) {
    this.complete = complete;
  }

  async triage(issues: GithubIssue[]): Promise<TriageResult[]> {
    const prompt = this.buildPrompt(issues);
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.complete(prompt);
      try {
        const parsed = this.extractAndParse(raw);
        return this.toTriageResults(parsed);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError;
  }

  private buildPrompt(issues: GithubIssue[]): string {
    const issueList = issues
      .map((issue) => {
        const body = issue.body.length > MAX_BODY_LENGTH
          ? issue.body.slice(0, MAX_BODY_LENGTH)
          : issue.body;
        return `### Issue #${issue.number}: ${issue.title}\n${body}`;
      })
      .join('\n\n');

    return `You are an issue triage assistant. Classify each GitHub issue by complexity.

## Classification Criteria

- **one-shot**: single file or tightly scoped change, 1-2 acceptance criteria, straightforward fix
- **chunked**: multi-file changes, 3+ acceptance criteria, architectural changes, multiple concerns

## Issues

${issueList}

## Instructions

Return a JSON array with one entry per issue. Each entry must have these fields:
- issueNumber (number)
- complexity ("one-shot" or "chunked")
- rationale (string explaining the classification)
- estimatedScope (string describing files/areas affected)

Return ONLY the JSON array, no other text.`;
  }

  private extractAndParse(raw: string): unknown[] {
    const text = cleanLlmJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}. Raw output start: "${raw.slice(0, 100)}..."`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Parsed value is not an array');
    }
    return parsed;
  }

  private toTriageResults(parsed: unknown[]): TriageResult[] {
    const results = parsed.map((entry): TriageResult => {
      const obj = entry as Record<string, unknown>;
      const complexity = typeof obj['complexity'] === 'string' && VALID_COMPLEXITIES.has(obj['complexity'])
        ? (obj['complexity'] as IssueComplexity)
        : 'one-shot';
      return {
        issueNumber: typeof obj['issueNumber'] === 'number' ? obj['issueNumber'] : 0,
        complexity,
        rationale: typeof obj['rationale'] === 'string' ? obj['rationale'] : 'No rationale provided',
        estimatedScope: typeof obj['estimatedScope'] === 'string' ? obj['estimatedScope'] : 'Unknown scope',
      };
    });

    return results.sort((a, b) => a.issueNumber - b.issueNumber);
  }
}
