import { describe, it, expect, vi } from 'vitest';
import { IssueTriage } from '../../../src/issues/issue-triage.js';
import type { GithubIssue, IIssueTriage, TriageResult } from '../../../src/issues/types.js';

type CompleteFn = (prompt: string) => Promise<string>;

function makeIssue(overrides: Partial<GithubIssue> & { number: number }): GithubIssue {
  return {
    title: `Issue ${overrides.number}`,
    body: `Body for issue ${overrides.number}`,
    labels: [],
    state: 'OPEN',
    url: `https://github.com/org/repo/issues/${overrides.number}`,
    ...overrides,
  };
}

function makeTriageResponse(entries: Array<{
  issueNumber: number;
  complexity: string;
  rationale: string;
  estimatedScope: string;
}>): string {
  return JSON.stringify(entries);
}

describe('IssueTriage', () => {
  describe('implements IIssueTriage', () => {
    it('satisfies the IIssueTriage interface', () => {
      const completeFn: CompleteFn = vi.fn(async () => '[]');
      const triage: IIssueTriage = new IssueTriage(completeFn);
      expect(triage.triage).toBeTypeOf('function');
    });
  });

  describe('triage()', () => {
    it('calls LLM with a prompt listing all issues', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 1, complexity: 'one-shot', rationale: 'Simple fix', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);
      const issues = [makeIssue({ number: 1, title: 'Fix bug', body: 'A bug' })];

      await triage.triage(issues);

      expect(completeFn).toHaveBeenCalledOnce();
      const prompt = completeFn.mock.calls[0]![0];
      expect(prompt).toContain('#1');
      expect(prompt).toContain('Fix bug');
      expect(prompt).toContain('A bug');
    });

    it('includes classification criteria in the prompt', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 1, complexity: 'one-shot', rationale: 'Simple', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);

      await triage.triage([makeIssue({ number: 1 })]);

      const prompt = completeFn.mock.calls[0]![0];
      expect(prompt).toMatch(/one-shot/i);
      expect(prompt).toMatch(/chunked/i);
      expect(prompt).toMatch(/single file|tightly scoped/i);
      expect(prompt).toMatch(/multi-file|architectural/i);
    });

    it('truncates issue bodies to 2000 characters', async () => {
      const longBody = 'x'.repeat(3000);
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 1, complexity: 'chunked', rationale: 'Big', estimatedScope: '5 files' },
        ]),
      );
      const triage = new IssueTriage(completeFn);

      await triage.triage([makeIssue({ number: 1, body: longBody })]);

      const prompt = completeFn.mock.calls[0]![0];
      // Body should be truncated — prompt should NOT contain the full 3000-char body
      expect(prompt).not.toContain(longBody);
      // But should contain the truncated portion
      expect(prompt).toContain('x'.repeat(2000));
    });

    it('parses valid LLM JSON response into TriageResult[]', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 5, complexity: 'chunked', rationale: 'Multi-file refactor', estimatedScope: '5 files' },
          { issueNumber: 3, complexity: 'one-shot', rationale: 'Typo fix', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);
      const issues = [makeIssue({ number: 3 }), makeIssue({ number: 5 })];

      const results = await triage.triage(issues);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual<TriageResult>({
        issueNumber: 3,
        complexity: 'one-shot',
        rationale: 'Typo fix',
        estimatedScope: '1 file',
      });
      expect(results[1]).toEqual<TriageResult>({
        issueNumber: 5,
        complexity: 'chunked',
        rationale: 'Multi-file refactor',
        estimatedScope: '5 files',
      });
    });

    it('returns results sorted by issue number', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 10, complexity: 'chunked', rationale: 'Big', estimatedScope: '3 files' },
          { issueNumber: 2, complexity: 'one-shot', rationale: 'Small', estimatedScope: '1 file' },
          { issueNumber: 7, complexity: 'one-shot', rationale: 'Medium', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);
      const issues = [makeIssue({ number: 10 }), makeIssue({ number: 2 }), makeIssue({ number: 7 })];

      const results = await triage.triage(issues);

      expect(results.map((r) => r.issueNumber)).toEqual([2, 7, 10]);
    });

    it('extracts JSON array from LLM output with preamble text', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        `Here is the classification:\n${makeTriageResponse([
          { issueNumber: 1, complexity: 'one-shot', rationale: 'Simple', estimatedScope: '1 file' },
        ])}\nDone.`,
      );
      const triage = new IssueTriage(completeFn);

      const results = await triage.triage([makeIssue({ number: 1 })]);

      expect(results).toHaveLength(1);
      expect(results[0]!.complexity).toBe('one-shot');
    });

    it('defaults to one-shot when complexity field is missing', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        JSON.stringify([
          { issueNumber: 1, rationale: 'No complexity', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);

      const results = await triage.triage([makeIssue({ number: 1 })]);

      expect(results[0]!.complexity).toBe('one-shot');
    });

    it('defaults to one-shot when complexity value is invalid', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        JSON.stringify([
          { issueNumber: 1, complexity: 'medium', rationale: 'Invalid complexity', estimatedScope: '2 files' },
        ]),
      );
      const triage = new IssueTriage(completeFn);

      const results = await triage.triage([makeIssue({ number: 1 })]);

      expect(results[0]!.complexity).toBe('one-shot');
    });

    it('retries once on malformed JSON then succeeds', async () => {
      let callCount = 0;
      const completeFn = vi.fn<CompleteFn>(async () => {
        callCount++;
        if (callCount === 1) return 'not valid json at all';
        return makeTriageResponse([
          { issueNumber: 1, complexity: 'one-shot', rationale: 'Fixed', estimatedScope: '1 file' },
        ]);
      });
      const triage = new IssueTriage(completeFn);

      const results = await triage.triage([makeIssue({ number: 1 })]);

      expect(completeFn).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
      expect(results[0]!.complexity).toBe('one-shot');
    });

    it('throws after retry on malformed JSON', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => 'garbage response');
      const triage = new IssueTriage(completeFn);

      await expect(triage.triage([makeIssue({ number: 1 })])).rejects.toThrow();
      expect(completeFn).toHaveBeenCalledTimes(2);
    });

    it('handles multiple issues in a single call', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 1, complexity: 'one-shot', rationale: 'Simple', estimatedScope: '1 file' },
          { issueNumber: 2, complexity: 'chunked', rationale: 'Complex', estimatedScope: '4 files' },
          { issueNumber: 3, complexity: 'one-shot', rationale: 'Simple', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 }), makeIssue({ number: 3 })];

      const results = await triage.triage(issues);

      expect(results).toHaveLength(3);
      expect(completeFn).toHaveBeenCalledOnce(); // single LLM call for all issues
    });

    it('instructs LLM to return JSON array with required fields', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        makeTriageResponse([
          { issueNumber: 1, complexity: 'one-shot', rationale: 'Simple', estimatedScope: '1 file' },
        ]),
      );
      const triage = new IssueTriage(completeFn);

      await triage.triage([makeIssue({ number: 1 })]);

      const prompt = completeFn.mock.calls[0]![0];
      expect(prompt).toContain('issueNumber');
      expect(prompt).toContain('complexity');
      expect(prompt).toContain('rationale');
      expect(prompt).toContain('estimatedScope');
    });

    it('provides default rationale and scope when fields are missing', async () => {
      const completeFn = vi.fn<CompleteFn>(async () =>
        JSON.stringify([{ issueNumber: 1 }]),
      );
      const triage = new IssueTriage(completeFn);

      const results = await triage.triage([makeIssue({ number: 1 })]);

      expect(results[0]!.rationale).toBeTruthy();
      expect(results[0]!.estimatedScope).toBeTruthy();
      expect(results[0]!.complexity).toBe('one-shot');
    });
  });
});
