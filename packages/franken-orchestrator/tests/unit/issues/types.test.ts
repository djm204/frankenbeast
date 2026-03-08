import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  GithubIssue,
  IssueFetchOptions,
  IssueComplexity,
  TriageResult,
  IssueOutcome,
  IIssueFetcher,
  IIssueTriage,
} from '../../../src/issues/index.js';

describe('GithubIssue', () => {
  it('has all required properties', () => {
    const issue: GithubIssue = {
      number: 42,
      title: 'Fix login bug',
      body: 'The login form crashes on submit',
      labels: ['bug', 'priority:high'],
      state: 'open',
      url: 'https://github.com/org/repo/issues/42',
    };

    expect(issue.number).toBe(42);
    expect(issue.title).toBe('Fix login bug');
    expect(issue.body).toBe('The login form crashes on submit');
    expect(issue.labels).toEqual(['bug', 'priority:high']);
    expect(issue.state).toBe('open');
    expect(issue.url).toBe('https://github.com/org/repo/issues/42');
  });

  it('labels is string[] not label objects', () => {
    expectTypeOf<GithubIssue['labels']>().toEqualTypeOf<string[]>();
  });

  it('has readonly properties', () => {
    expectTypeOf<Readonly<GithubIssue>>().toEqualTypeOf<GithubIssue>();
  });
});

describe('IssueFetchOptions', () => {
  it('all properties are optional', () => {
    const empty: IssueFetchOptions = {};
    expect(empty).toEqual({});
  });

  it('accepts all optional properties', () => {
    const opts: IssueFetchOptions = {
      repo: 'org/repo',
      label: ['bug', 'enhancement'],
      milestone: 'v1.0',
      search: 'login crash',
      assignee: 'octocat',
      limit: 50,
    };

    expect(opts.repo).toBe('org/repo');
    expect(opts.label).toEqual(['bug', 'enhancement']);
    expect(opts.milestone).toBe('v1.0');
    expect(opts.search).toBe('login crash');
    expect(opts.assignee).toBe('octocat');
    expect(opts.limit).toBe(50);
  });

  it('limit type is number or undefined', () => {
    expectTypeOf<IssueFetchOptions['limit']>().toEqualTypeOf<number | undefined>();
  });

  it('label type is string[] or undefined', () => {
    expectTypeOf<IssueFetchOptions['label']>().toEqualTypeOf<string[] | undefined>();
  });

  it('has readonly properties', () => {
    expectTypeOf<Readonly<IssueFetchOptions>>().toEqualTypeOf<IssueFetchOptions>();
  });
});

describe('IssueComplexity', () => {
  it('accepts one-shot', () => {
    const c: IssueComplexity = 'one-shot';
    expect(c).toBe('one-shot');
  });

  it('accepts chunked', () => {
    const c: IssueComplexity = 'chunked';
    expect(c).toBe('chunked');
  });

  it('is a union of exactly two string literals', () => {
    expectTypeOf<IssueComplexity>().toEqualTypeOf<'one-shot' | 'chunked'>();
  });
});

describe('TriageResult', () => {
  it('has all required properties', () => {
    const result: TriageResult = {
      issueNumber: 42,
      complexity: 'one-shot',
      rationale: 'Simple typo fix in README',
      estimatedScope: 'single file change',
    };

    expect(result.issueNumber).toBe(42);
    expect(result.complexity).toBe('one-shot');
    expect(result.rationale).toBe('Simple typo fix in README');
    expect(result.estimatedScope).toBe('single file change');
  });

  it('complexity is IssueComplexity type', () => {
    expectTypeOf<TriageResult['complexity']>().toEqualTypeOf<IssueComplexity>();
  });

  it('has readonly properties', () => {
    expectTypeOf<Readonly<TriageResult>>().toEqualTypeOf<TriageResult>();
  });
});

describe('IssueOutcome', () => {
  it('has all required properties', () => {
    const outcome: IssueOutcome = {
      issueNumber: 42,
      issueTitle: 'Fix login bug',
      status: 'fixed',
      tokensUsed: 15_000,
    };

    expect(outcome.issueNumber).toBe(42);
    expect(outcome.issueTitle).toBe('Fix login bug');
    expect(outcome.status).toBe('fixed');
    expect(outcome.tokensUsed).toBe(15_000);
  });

  it('accepts optional prUrl and error', () => {
    const outcome: IssueOutcome = {
      issueNumber: 42,
      issueTitle: 'Fix login bug',
      status: 'fixed',
      tokensUsed: 15_000,
      prUrl: 'https://github.com/org/repo/pull/43',
      error: undefined,
    };

    expect(outcome.prUrl).toBe('https://github.com/org/repo/pull/43');
  });

  it('status is a union of fixed, failed, skipped', () => {
    expectTypeOf<IssueOutcome['status']>().toEqualTypeOf<'fixed' | 'failed' | 'skipped'>();
  });

  it('prUrl is optional string', () => {
    expectTypeOf<IssueOutcome['prUrl']>().toEqualTypeOf<string | undefined>();
  });

  it('error is optional string', () => {
    expectTypeOf<IssueOutcome['error']>().toEqualTypeOf<string | undefined>();
  });

  it('has readonly properties', () => {
    expectTypeOf<Readonly<IssueOutcome>>().toEqualTypeOf<IssueOutcome>();
  });
});

describe('IIssueFetcher', () => {
  it('has fetch method returning Promise<GithubIssue[]>', () => {
    const fetcher: IIssueFetcher = {
      fetch: async (_options: IssueFetchOptions): Promise<GithubIssue[]> => [],
      inferRepo: async (): Promise<string> => 'org/repo',
    };

    expectTypeOf(fetcher.fetch).returns.resolves.toEqualTypeOf<GithubIssue[]>();
  });

  it('has inferRepo method returning Promise<string>', () => {
    const fetcher: IIssueFetcher = {
      fetch: async () => [],
      inferRepo: async () => 'org/repo',
    };

    expectTypeOf(fetcher.inferRepo).returns.resolves.toEqualTypeOf<string>();
  });

  it('fetch accepts IssueFetchOptions parameter', async () => {
    const fetcher: IIssueFetcher = {
      fetch: async (options) => {
        expect(options).toEqual({ repo: 'org/repo', limit: 10 });
        return [];
      },
      inferRepo: async () => 'org/repo',
    };

    await fetcher.fetch({ repo: 'org/repo', limit: 10 });
  });
});

describe('IIssueTriage', () => {
  it('has triage method accepting GithubIssue[] and returning Promise<TriageResult[]>', () => {
    const triage: IIssueTriage = {
      triage: async (_issues: GithubIssue[]): Promise<TriageResult[]> => [],
    };

    expectTypeOf(triage.triage).returns.resolves.toEqualTypeOf<TriageResult[]>();
  });

  it('triage processes issues and returns results', async () => {
    const issues: GithubIssue[] = [
      {
        number: 1,
        title: 'Bug',
        body: 'Something broke',
        labels: ['bug'],
        state: 'open',
        url: 'https://github.com/org/repo/issues/1',
      },
    ];

    const triager: IIssueTriage = {
      triage: async (input) => input.map((i) => ({
        issueNumber: i.number,
        complexity: 'one-shot' as const,
        rationale: 'Simple fix',
        estimatedScope: 'single file',
      })),
    };

    const results = await triager.triage(issues);
    expect(results).toHaveLength(1);
    expect(results[0]!.issueNumber).toBe(1);
    expect(results[0]!.complexity).toBe('one-shot');
  });
});

describe('barrel export', () => {
  it('re-exports all types from issues/index.ts', async () => {
    // This test verifies the barrel export works by importing from it
    // (all imports at the top of this file come from the barrel)
    // If this file compiles and runs, the barrel is working
    const mod = await import('../../../src/issues/index.js');
    expect(mod).toBeDefined();
  });
});
