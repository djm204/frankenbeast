import { describe, it, expect } from 'vitest';
import { IssueReview } from '../../../src/issues/issue-review.js';
import type { ReviewIO } from '../../../src/issues/issue-review.js';
import type { GithubIssue, TriageResult } from '../../../src/issues/types.js';

function makeIssue(overrides: Partial<GithubIssue> & { number: number }): GithubIssue {
  return {
    title: `Issue ${overrides.number}`,
    body: `Body for ${overrides.number}`,
    labels: [],
    state: 'OPEN',
    url: `https://github.com/test/repo/issues/${overrides.number}`,
    ...overrides,
  };
}

function makeTriage(overrides: Partial<TriageResult> & { issueNumber: number }): TriageResult {
  return {
    complexity: 'one-shot',
    rationale: 'Simple fix',
    estimatedScope: '1 file',
    ...overrides,
  };
}

function createMockIO(inputs: string[]) {
  let callIdx = 0;
  const mock = {
    output: [] as string[],
    readCalls: 0,
    async read(): Promise<string> {
      mock.readCalls++;
      const val = inputs[callIdx];
      callIdx++;
      return val ?? '';
    },
    write(text: string): void {
      mock.output.push(text);
    },
  };
  return mock satisfies ReviewIO & { output: string[]; readCalls: number };
}

describe('IssueReview', () => {
  describe('approve', () => {
    it('approves all triage results on Y input', async () => {
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triage = [makeTriage({ issueNumber: 1 }), makeTriage({ issueNumber: 2 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('execute');
      expect(result.approved).toHaveLength(2);
    });

    it('approves all on empty input', async () => {
      const issues = [makeIssue({ number: 1 })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('execute');
      expect(result.approved).toEqual(triage);
    });
  });

  describe('abort', () => {
    it('returns abort with empty approved on n input', async () => {
      const issues = [makeIssue({ number: 1 })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['n']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('abort');
      expect(result.approved).toEqual([]);
    });
  });

  describe('edit mode', () => {
    it('removes specified issue and approves remaining', async () => {
      const issues = [
        makeIssue({ number: 1 }),
        makeIssue({ number: 2 }),
        makeIssue({ number: 3 }),
      ];
      const triage = [
        makeTriage({ issueNumber: 1 }),
        makeTriage({ issueNumber: 2 }),
        makeTriage({ issueNumber: 3 }),
      ];
      const io = createMockIO(['edit', '2', 'Y']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('execute');
      expect(result.approved).toHaveLength(2);
      expect(result.approved.map((t) => t.issueNumber)).toEqual([1, 3]);
    });

    it('removes comma-separated issues', async () => {
      const issues = [
        makeIssue({ number: 1 }),
        makeIssue({ number: 2 }),
        makeIssue({ number: 3 }),
      ];
      const triage = [
        makeTriage({ issueNumber: 1 }),
        makeTriage({ issueNumber: 2 }),
        makeTriage({ issueNumber: 3 }),
      ];
      const io = createMockIO(['edit', '1, 3', 'Y']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('execute');
      expect(result.approved).toHaveLength(1);
      expect(result.approved[0]!.issueNumber).toBe(2);
    });

    it('warns on invalid issue numbers and re-prompts', async () => {
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triage = [
        makeTriage({ issueNumber: 1 }),
        makeTriage({ issueNumber: 2 }),
      ];
      // Flow: edit → invalid 99 → re-prompt → valid 1 → approve
      const io = createMockIO(['edit', '99', '1', 'Y']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      const allOutput = io.output.join('\n');
      expect(allOutput).toContain('99');
      expect(result.approved).toHaveLength(1);
      expect(result.approved[0]!.issueNumber).toBe(2);
    });

    it('can abort after editing', async () => {
      const issues = [makeIssue({ number: 1 }), makeIssue({ number: 2 })];
      const triage = [
        makeTriage({ issueNumber: 1 }),
        makeTriage({ issueNumber: 2 }),
      ];
      const io = createMockIO(['edit', '1', 'n']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('abort');
      expect(result.approved).toEqual([]);
    });

    it('supports multiple edit rounds', async () => {
      const issues = [
        makeIssue({ number: 1 }),
        makeIssue({ number: 2 }),
        makeIssue({ number: 3 }),
      ];
      const triage = [
        makeTriage({ issueNumber: 1 }),
        makeTriage({ issueNumber: 2 }),
        makeTriage({ issueNumber: 3 }),
      ];
      // edit → remove 1 → re-display → edit → remove 3 → re-display → approve
      const io = createMockIO(['edit', '1', 'edit', '3', 'Y']);
      const review = new IssueReview(io);

      const result = await review.review(issues, triage);

      expect(result.action).toBe('execute');
      expect(result.approved).toHaveLength(1);
      expect(result.approved[0]!.issueNumber).toBe(2);
    });
  });

  describe('table display', () => {
    it('includes all required columns', async () => {
      const issues = [makeIssue({ number: 42, title: 'Fix login bug', labels: ['high'] })];
      const triage = [
        makeTriage({ issueNumber: 42, complexity: 'chunked', rationale: 'Multi-file change' }),
      ];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      expect(output).toContain('42');
      expect(output).toContain('Fix login bug');
      expect(output).toContain('high');
      expect(output).toContain('chunked');
      expect(output).toContain('Multi-file change');
    });

    it('truncates titles longer than 50 chars with ellipsis', async () => {
      const longTitle =
        'This is a very long issue title that exceeds fifty characters by a lot';
      const issues = [makeIssue({ number: 1, title: longTitle })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      expect(output).toContain(longTitle.slice(0, 47) + '...');
      expect(output).not.toContain(longTitle);
    });

    it('does not truncate titles of 50 chars or fewer', async () => {
      const title = 'Exactly fifty characters long title for this test!'; // 50 chars
      expect(title).toHaveLength(50);
      const issues = [makeIssue({ number: 1, title })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      expect(output).toContain(title);
    });

    it('extracts severity from issue labels', async () => {
      const issues = [makeIssue({ number: 1, labels: ['bug', 'critical', 'urgent'] })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      const lines = output.split('\n');
      const dataLine = lines.find((l) => l.includes('Issue 1'));
      expect(dataLine).toContain('critical');
    });

    it('uses first matching severity label from issue labels', async () => {
      const issues = [makeIssue({ number: 1, labels: ['medium', 'high'] })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      const lines = output.split('\n');
      const dataLine = lines.find((l) => l.includes('Issue 1'));
      expect(dataLine).toContain('medium');
    });

    it('shows dash for issues without severity labels', async () => {
      const issues = [makeIssue({ number: 1, labels: ['bug', 'enhancement'] })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      const lines = output.split('\n');
      const dataLine = lines.find((l) => l.includes('Issue 1'));
      expect(dataLine).toBeDefined();
      expect(dataLine).toContain('-');
      expect(dataLine).not.toMatch(/critical|high|medium|low/);
    });

    it('shows the approval prompt', async () => {
      const issues = [makeIssue({ number: 1 })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('');
      expect(output).toContain('Approve all? [Y/n/edit]');
    });
  });

  describe('sort order', () => {
    it('sorts by severity priority then issue number', async () => {
      const issues = [
        makeIssue({ number: 5, labels: ['low'] }),
        makeIssue({ number: 1, labels: ['high'] }),
        makeIssue({ number: 3, labels: ['critical'] }),
        makeIssue({ number: 2, labels: ['high'] }),
        makeIssue({ number: 4 }), // unlabelled
      ];
      const triage = [
        makeTriage({ issueNumber: 5 }),
        makeTriage({ issueNumber: 1 }),
        makeTriage({ issueNumber: 3 }),
        makeTriage({ issueNumber: 2 }),
        makeTriage({ issueNumber: 4 }),
      ];
      const io = createMockIO(['Y']);
      const review = new IssueReview(io);

      await review.review(issues, triage);

      const output = io.output.join('\n');
      const lines = output.split('\n');
      // Filter to data lines containing issue titles
      const dataLines = lines.filter((l) => /Issue \d/.test(l));
      const issueNumbers = dataLines.map((l) => {
        const match = /Issue (\d)/.exec(l);
        return match ? parseInt(match[1]!, 10) : -1;
      });
      // Expected order: 3 (critical), 1 (high), 2 (high), 5 (low), 4 (unlabelled)
      expect(issueNumbers).toEqual([3, 1, 2, 5, 4]);
    });
  });

  describe('dry-run mode', () => {
    it('displays table and returns abort without prompting', async () => {
      const issues = [makeIssue({ number: 1, labels: ['high'] })];
      const triage = [makeTriage({ issueNumber: 1 })];
      const io = createMockIO([]); // no inputs — should not prompt
      const review = new IssueReview(io, { dryRun: true });

      const result = await review.review(issues, triage);

      expect(result.action).toBe('abort');
      expect(result.approved).toEqual([]);
      // Table should be displayed
      const output = io.output.join('\n');
      expect(output).toContain('Issue 1');
      // Should not have prompted (no read calls)
      expect(io.readCalls).toBe(0);
    });
  });
});
