import { describe, it, expect, vi } from 'vitest';
import { IssueGraphBuilder } from '../../../src/issues/issue-graph-builder.js';
import type { GithubIssue, TriageResult } from '../../../src/issues/types.js';
import type { PlanGraph, PlanTask } from '../../../src/deps.js';

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

function makeTriageResult(
  issueNumber: number,
  complexity: 'one-shot' | 'chunked',
): TriageResult {
  return {
    issueNumber,
    complexity,
    rationale: `Test rationale for #${issueNumber}`,
    estimatedScope: complexity === 'one-shot' ? '1 file' : '3 files',
  };
}

function taskById(tasks: readonly PlanTask[], id: string): PlanTask | undefined {
  return tasks.find((t) => t.id === id);
}

describe('IssueGraphBuilder', () => {
  describe('one-shot path', () => {
    it('creates exactly 2 tasks: impl and harden', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 42 });
      const triage = makeTriageResult(42, 'one-shot');

      const graph = await builder.buildForIssue(issue, triage);

      expect(graph.tasks).toHaveLength(2);
      expect(taskById(graph.tasks, 'impl:issue-42')).toBeDefined();
      expect(taskById(graph.tasks, 'harden:issue-42')).toBeDefined();
    });

    it('impl task objective includes issue title and body', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({
        number: 7,
        title: 'Fix login bug',
        body: 'Users cannot login after password reset',
      });
      const triage = makeTriageResult(7, 'one-shot');

      const graph = await builder.buildForIssue(issue, triage);

      const impl = taskById(graph.tasks, 'impl:issue-7')!;
      expect(impl.objective).toContain('Fix login bug');
      expect(impl.objective).toContain('Users cannot login after password reset');
    });

    it('impl task objective includes acceptance criteria when present in body', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({
        number: 15,
        title: 'Add validation',
        body: 'Add email validation.\n\n## Acceptance Criteria\n- Reject invalid emails\n- Show error message',
      });
      const triage = makeTriageResult(15, 'one-shot');

      const graph = await builder.buildForIssue(issue, triage);

      const impl = taskById(graph.tasks, 'impl:issue-15')!;
      expect(impl.objective).toContain('Acceptance Criteria');
      expect(impl.objective).toContain('Reject invalid emails');
    });

    it('harden task depends on impl task', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 3 });
      const triage = makeTriageResult(3, 'one-shot');

      const graph = await builder.buildForIssue(issue, triage);

      const harden = taskById(graph.tasks, 'harden:issue-3')!;
      expect(harden.dependsOn).toEqual(['impl:issue-3']);
    });

    it('harden task objective references the issue number', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 99 });
      const triage = makeTriageResult(99, 'one-shot');

      const graph = await builder.buildForIssue(issue, triage);

      const harden = taskById(graph.tasks, 'harden:issue-99')!;
      expect(harden.objective).toContain('issue #99');
      expect(harden.objective).toMatch(/review and verify/i);
      expect(harden.objective).toMatch(/run tests/i);
      expect(harden.objective).toMatch(/acceptance criteria/i);
    });

    it('does not call LLM for one-shot issues', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 1 });
      const triage = makeTriageResult(1, 'one-shot');

      await builder.buildForIssue(issue, triage);

      expect(completeFn).not.toHaveBeenCalled();
    });

    it('impl task has no dependencies', async () => {
      const completeFn = vi.fn<CompleteFn>();
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 5 });
      const triage = makeTriageResult(5, 'one-shot');

      const graph = await builder.buildForIssue(issue, triage);

      const impl = taskById(graph.tasks, 'impl:issue-5')!;
      expect(impl.dependsOn).toEqual([]);
    });
  });

  describe('chunked path', () => {
    const twoChunks = [
      {
        id: 'setup',
        objective: 'Set up scaffolding',
        files: ['src/index.ts'],
        successCriteria: 'Project compiles',
        verificationCommand: 'npx tsc --noEmit',
        dependencies: [],
      },
      {
        id: 'feature',
        objective: 'Implement feature',
        files: ['src/feature.ts'],
        successCriteria: 'Tests pass',
        verificationCommand: 'npx vitest run',
        dependencies: [],
      },
    ];

    it('calls LLM to decompose a chunked issue', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(twoChunks));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 10, title: 'Big refactor', body: 'Refactor the auth system' });
      const triage = makeTriageResult(10, 'chunked');

      await builder.buildForIssue(issue, triage);

      expect(completeFn).toHaveBeenCalledOnce();
    });

    it('decomposition prompt includes issue title, body, and acceptance criteria', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(twoChunks));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({
        number: 10,
        title: 'Refactor auth',
        body: 'Redesign the authentication module.\n\n## Acceptance Criteria\n- Support OAuth\n- Support JWT',
      });
      const triage = makeTriageResult(10, 'chunked');

      await builder.buildForIssue(issue, triage);

      const prompt = completeFn.mock.calls[0]![0];
      expect(prompt).toContain('Refactor auth');
      expect(prompt).toContain('Redesign the authentication module');
      expect(prompt).toContain('Support OAuth');
      expect(prompt).toContain('Support JWT');
    });

    it('creates impl+harden pairs per chunk with issue-scoped IDs', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(twoChunks));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 10 });
      const triage = makeTriageResult(10, 'chunked');

      const graph = await builder.buildForIssue(issue, triage);

      expect(graph.tasks).toHaveLength(4); // 2 chunks × 2 tasks
      expect(taskById(graph.tasks, 'impl:issue-10/chunk-1')).toBeDefined();
      expect(taskById(graph.tasks, 'harden:issue-10/chunk-1')).toBeDefined();
      expect(taskById(graph.tasks, 'impl:issue-10/chunk-2')).toBeDefined();
      expect(taskById(graph.tasks, 'harden:issue-10/chunk-2')).toBeDefined();
    });

    it('harden tasks depend on their own impl task', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(twoChunks));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 10 });
      const triage = makeTriageResult(10, 'chunked');

      const graph = await builder.buildForIssue(issue, triage);

      const harden1 = taskById(graph.tasks, 'harden:issue-10/chunk-1')!;
      expect(harden1.dependsOn).toContain('impl:issue-10/chunk-1');

      const harden2 = taskById(graph.tasks, 'harden:issue-10/chunk-2')!;
      expect(harden2.dependsOn).toContain('impl:issue-10/chunk-2');
    });

    it('creates linear dependency chain: chunk N+1 impl depends on chunk N harden', async () => {
      const threeChunks = [
        { id: 'a', objective: 'A', files: ['a.ts'], successCriteria: 'ok', verificationCommand: 'echo', dependencies: [] },
        { id: 'b', objective: 'B', files: ['b.ts'], successCriteria: 'ok', verificationCommand: 'echo', dependencies: [] },
        { id: 'c', objective: 'C', files: ['c.ts'], successCriteria: 'ok', verificationCommand: 'echo', dependencies: [] },
      ];
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(threeChunks));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 20 });
      const triage = makeTriageResult(20, 'chunked');

      const graph = await builder.buildForIssue(issue, triage);

      // First chunk impl has no inter-chunk dependencies
      const impl1 = taskById(graph.tasks, 'impl:issue-20/chunk-1')!;
      expect(impl1.dependsOn).toEqual([]);

      // Second chunk impl depends on first chunk harden
      const impl2 = taskById(graph.tasks, 'impl:issue-20/chunk-2')!;
      expect(impl2.dependsOn).toEqual(['harden:issue-20/chunk-1']);

      // Third chunk impl depends on second chunk harden
      const impl3 = taskById(graph.tasks, 'impl:issue-20/chunk-3')!;
      expect(impl3.dependsOn).toEqual(['harden:issue-20/chunk-2']);
    });

    it('handles LLM response wrapped in markdown fences', async () => {
      const fenced = '```json\n' + JSON.stringify(twoChunks) + '\n```';
      const completeFn = vi.fn<CompleteFn>(async () => fenced);
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 30 });
      const triage = makeTriageResult(30, 'chunked');

      const graph = await builder.buildForIssue(issue, triage);

      expect(graph.tasks).toHaveLength(4);
    });

    it('throws on malformed JSON from LLM', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => 'not valid json');
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 40 });
      const triage = makeTriageResult(40, 'chunked');

      await expect(builder.buildForIssue(issue, triage)).rejects.toThrow(/failed to parse/i);
    });

    it('throws when LLM returns a non-array', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify({ id: 'oops' }));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 41 });
      const triage = makeTriageResult(41, 'chunked');

      await expect(builder.buildForIssue(issue, triage)).rejects.toThrow(/not a JSON array/i);
    });

    it('throws when a chunk is missing required fields', async () => {
      const incomplete = [{ id: 'partial', objective: 'Something' }];
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(incomplete));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 42 });
      const triage = makeTriageResult(42, 'chunked');

      await expect(builder.buildForIssue(issue, triage)).rejects.toThrow(/missing required fields/i);
    });

    it('decomposition prompt is distinct from LlmGraphBuilder prompt (issue-focused, not design-doc)', async () => {
      const completeFn = vi.fn<CompleteFn>(async () => JSON.stringify(twoChunks));
      const builder = new IssueGraphBuilder(completeFn);
      const issue = makeIssue({ number: 50, title: 'Fix perf issue', body: 'App is slow' });
      const triage = makeTriageResult(50, 'chunked');

      await builder.buildForIssue(issue, triage);

      const prompt = completeFn.mock.calls[0]![0];
      // Should reference "issue" not "design document"
      expect(prompt).toMatch(/issue/i);
      expect(prompt).not.toMatch(/design document/i);
    });
  });
});
