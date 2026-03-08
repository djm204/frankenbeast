import { describe, it, expect, vi } from 'vitest';
import { IssueFetcher } from '../../../src/issues/issue-fetcher.js';
import type { GithubIssue, IIssueFetcher, IssueFetchOptions } from '../../../src/issues/types.js';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFn = (file: string, args: string[], callback: ExecCallback) => void;

function makeExecFn(stdout: string, stderr = ''): ExecFn {
  return (_file: string, _args: string[], callback: ExecCallback) => {
    callback(null, stdout, stderr);
  };
}

function makeFailingExecFn(stderr: string, code = 1): ExecFn {
  return (_file: string, _args: string[], callback: ExecCallback) => {
    const error = new Error(`Command failed with exit code ${code}`) as Error & { code: number };
    error.code = code;
    callback(error, '', stderr);
  };
}

const SAMPLE_GH_OUTPUT = JSON.stringify([
  {
    number: 42,
    title: 'Fix login bug',
    body: 'The login form crashes on submit',
    labels: [{ name: 'bug' }, { name: 'priority:high' }],
    state: 'OPEN',
    url: 'https://github.com/org/repo/issues/42',
  },
  {
    number: 43,
    title: 'Add dark mode',
    body: 'Support dark theme',
    labels: [{ name: 'enhancement' }],
    state: 'OPEN',
    url: 'https://github.com/org/repo/issues/43',
  },
]);

describe('IssueFetcher', () => {
  describe('implements IIssueFetcher', () => {
    it('satisfies the IIssueFetcher interface', () => {
      const fetcher: IIssueFetcher = new IssueFetcher(makeExecFn('[]'));
      expect(fetcher.fetch).toBeTypeOf('function');
      expect(fetcher.inferRepo).toBeTypeOf('function');
    });
  });

  describe('fetch()', () => {
    it('builds gh issue list command with --json fields', async () => {
      const execFn = vi.fn(makeExecFn('[]'));
      const fetcher = new IssueFetcher(execFn);

      // Will throw because 0 results, but we can check the command built
      await expect(fetcher.fetch({})).rejects.toThrow();

      expect(execFn).toHaveBeenCalledOnce();
      const [file, args] = execFn.mock.calls[0]!;
      expect(file).toBe('gh');
      expect(args).toContain('issue');
      expect(args).toContain('list');
      expect(args).toContain('--json');
      expect(args).toContain('number,title,body,labels,state,url');
    });

    it('adds default --limit 30 when no limit specified', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({});

      const [, args] = execFn.mock.calls[0]!;
      const limitIdx = args.indexOf('--limit');
      expect(limitIdx).toBeGreaterThan(-1);
      expect(args[limitIdx + 1]).toBe('30');
    });

    it('uses custom --limit when provided', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({ limit: 50 });

      const [, args] = execFn.mock.calls[0]!;
      const limitIdx = args.indexOf('--limit');
      expect(args[limitIdx + 1]).toBe('50');
    });

    it('adds each label as separate --label flag', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({ label: ['bug', 'critical'] });

      const [, args] = execFn.mock.calls[0]!;
      const labelIndices = args
        .map((a: string, i: number) => (a === '--label' ? i : -1))
        .filter((i: number) => i !== -1);
      expect(labelIndices).toHaveLength(2);
      expect(args[labelIndices[0]! + 1]).toBe('bug');
      expect(args[labelIndices[1]! + 1]).toBe('critical');
    });

    it('adds --milestone filter', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({ milestone: 'v1.0' });

      const [, args] = execFn.mock.calls[0]!;
      const idx = args.indexOf('--milestone');
      expect(idx).toBeGreaterThan(-1);
      expect(args[idx + 1]).toBe('v1.0');
    });

    it('adds --search filter', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({ search: 'login crash' });

      const [, args] = execFn.mock.calls[0]!;
      const idx = args.indexOf('--search');
      expect(idx).toBeGreaterThan(-1);
      expect(args[idx + 1]).toBe('login crash');
    });

    it('adds --assignee filter', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({ assignee: 'octocat' });

      const [, args] = execFn.mock.calls[0]!;
      const idx = args.indexOf('--assignee');
      expect(idx).toBeGreaterThan(-1);
      expect(args[idx + 1]).toBe('octocat');
    });

    it('adds --repo filter when provided', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({ repo: 'org/repo' });

      const [, args] = execFn.mock.calls[0]!;
      const idx = args.indexOf('--repo');
      expect(idx).toBeGreaterThan(-1);
      expect(args[idx + 1]).toBe('org/repo');
    });

    it('does not add --repo when not provided', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({});

      const [, args] = execFn.mock.calls[0]!;
      expect(args).not.toContain('--repo');
    });

    it('parses JSON output and maps labels from objects to strings', async () => {
      const execFn = makeExecFn(SAMPLE_GH_OUTPUT);
      const fetcher = new IssueFetcher(execFn);

      const issues = await fetcher.fetch({});

      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual<GithubIssue>({
        number: 42,
        title: 'Fix login bug',
        body: 'The login form crashes on submit',
        labels: ['bug', 'priority:high'],
        state: 'OPEN',
        url: 'https://github.com/org/repo/issues/42',
      });
      expect(issues[1]!.labels).toEqual(['enhancement']);
    });

    it('throws descriptive error when fetch returns 0 results', async () => {
      const execFn = makeExecFn('[]');
      const fetcher = new IssueFetcher(execFn);

      await expect(fetcher.fetch({})).rejects.toThrow(/no issues found/i);
    });

    it('throws descriptive error when gh command fails', async () => {
      const execFn = makeFailingExecFn('gh: command not found');
      const fetcher = new IssueFetcher(execFn);

      await expect(fetcher.fetch({})).rejects.toThrow(/gh.*command/i);
    });

    it('includes stderr in error when gh auth is needed', async () => {
      const execFn = makeFailingExecFn('To get started with GitHub CLI, please run:  gh auth login');
      const fetcher = new IssueFetcher(execFn);

      await expect(fetcher.fetch({})).rejects.toThrow(/gh auth login/i);
    });

    it('includes stderr in error for HTTP 404', async () => {
      const execFn = makeFailingExecFn('HTTP 404: Not Found');
      const fetcher = new IssueFetcher(execFn);

      await expect(fetcher.fetch({})).rejects.toThrow(/HTTP 404/i);
    });

    it('includes stderr in error for not a git repository', async () => {
      const execFn = makeFailingExecFn('not a git repository (or any of the parent directories)');
      const fetcher = new IssueFetcher(execFn);

      await expect(fetcher.fetch({})).rejects.toThrow(/not a git repository/i);
    });

    it('combines all filters in a single call', async () => {
      const execFn = vi.fn(makeExecFn(SAMPLE_GH_OUTPUT));
      const fetcher = new IssueFetcher(execFn);

      await fetcher.fetch({
        repo: 'org/repo',
        label: ['bug'],
        milestone: 'v2.0',
        search: 'crash',
        assignee: 'octocat',
        limit: 10,
      });

      const [, args] = execFn.mock.calls[0]!;
      expect(args).toContain('--repo');
      expect(args).toContain('--label');
      expect(args).toContain('--milestone');
      expect(args).toContain('--search');
      expect(args).toContain('--assignee');
      expect(args).toContain('--limit');
    });
  });

  describe('inferRepo()', () => {
    it('runs gh repo view --json nameWithOwner and extracts value', async () => {
      const execFn = vi.fn(
        makeExecFn(JSON.stringify({ nameWithOwner: 'org/my-repo' })),
      );
      const fetcher = new IssueFetcher(execFn);

      const repo = await fetcher.inferRepo();

      expect(repo).toBe('org/my-repo');
      const [file, args] = execFn.mock.calls[0]!;
      expect(file).toBe('gh');
      expect(args).toContain('repo');
      expect(args).toContain('view');
      expect(args).toContain('--json');
      expect(args).toContain('nameWithOwner');
    });

    it('throws descriptive error when gh repo view fails', async () => {
      const execFn = makeFailingExecFn('not a git repository');
      const fetcher = new IssueFetcher(execFn);

      await expect(fetcher.inferRepo()).rejects.toThrow(/not a git repository/i);
    });
  });

  describe('constructor', () => {
    it('accepts optional execFn for testability', () => {
      const customExec = makeExecFn('[]');
      const fetcher = new IssueFetcher(customExec);
      expect(fetcher).toBeInstanceOf(IssueFetcher);
    });
  });
});
