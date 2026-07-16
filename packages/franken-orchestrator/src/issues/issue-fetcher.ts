import { execFile as defaultExecFile } from 'node:child_process';
import { parseSafeJson } from '../utils/safe-json.js';
import type { GithubIssue, IIssueFetcher, IssueFetchOptions } from './types.js';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFn = (file: string, args: string[], callback: ExecCallback) => void;

const DEFAULT_ISSUE_FETCH_LIMIT = 1_000;
const DEFAULT_ISSUE_FETCH_URGENT_LIMIT = 1_000;
const DEFAULT_ISSUE_FETCH_RECENT_LIMIT = 200;
const MIN_ISSUE_FETCH_BUFFER_BYTES = 2_097_152;
const MAX_ISSUE_FETCH_BUFFER_BYTES = 128 * 1_024 * 1_024;
const APPROX_MAX_GITHUB_ISSUE_BODY_BYTES = 65_536;
const DEFAULT_PRIORITY_ISSUE_QUERY = '(label:critical OR label:p0 OR label:p1 OR label:p2 OR label:p3 OR label:high OR label:medium OR label:low OR label:"priority:p0" OR label:"priority:p1" OR label:"priority:p2" OR label:"priority:p3" OR label:"priority:critical" OR label:"priority:high" OR label:"priority:medium" OR label:"priority:low")';
const ISSUE_FETCH_PRIORITY_RANKS: Readonly<Record<string, number>> = {
  p0: 0,
  'priority:p0': 0,
  'priority:critical': 0,
  critical: 0,
  p1: 1,
  'priority:p1': 1,
  'priority:high': 1,
  high: 1,
  p2: 2,
  'priority:p2': 2,
  'priority:medium': 2,
  medium: 2,
  p3: 3,
  'priority:p3': 3,
  'priority:low': 3,
  low: 3,
};
const DEFAULT_ISSUE_FETCH_PRIORITY_RANK = 99;
const ISSUE_FETCH_ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ISSUE_FETCH_PRIORITY_AGING_DAYS_PER_RANK = 14;
const ISSUE_FETCH_MAX_PRIORITY_AGE_BOOST = 2;

interface RawGithubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
  readonly state: string;
  readonly url: string;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
}

export class IssueFetcher implements IIssueFetcher {
  private readonly execFn: ExecFn | undefined;

  constructor(execFn?: ExecFn) {
    this.execFn = execFn;
  }

  async fetch(options: IssueFetchOptions): Promise<GithubIssue[]> {
    const raw = options.search
      ? await this.fetchIssuePage(options, options.search, options.limit ?? DEFAULT_ISSUE_FETCH_LIMIT)
      : await this.fetchDefaultIssuePages(options, options.limit ?? DEFAULT_ISSUE_FETCH_LIMIT);

    return raw.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      labels: issue.labels.map((l) => l.name),
      state: issue.state,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }));
  }

  private async fetchDefaultIssuePages(options: IssueFetchOptions, limit: number): Promise<RawGithubIssue[]> {
    try {
      return this.mergeIssuePages(
        [
          await this.fetchIssuePage(options, `${DEFAULT_PRIORITY_ISSUE_QUERY} sort:created-desc`, limit),
          await this.fetchIssuePage(options, `${DEFAULT_PRIORITY_ISSUE_QUERY} sort:created-asc`, limit),
          await this.fetchIssuePage(options, 'sort:created-desc', Math.min(DEFAULT_ISSUE_FETCH_RECENT_LIMIT, limit)),
          await this.fetchIssuePage(options, 'sort:created-asc', limit),
        ],
        limit,
      );
    } catch (err) {
      if (!this.isUnsupportedAdvancedSearchError(err)) {
        throw err;
      }
      try {
        return this.mergeIssuePages(
          [
            await this.fetchIssuePage(options, 'sort:created-desc', DEFAULT_ISSUE_FETCH_RECENT_LIMIT),
            await this.fetchIssuePage(options, 'sort:created-asc', limit),
          ],
          limit,
        );
      } catch (fallbackErr) {
        if (!this.isUnsupportedAdvancedSearchError(fallbackErr)) {
          throw fallbackErr;
        }
        return this.mergeIssuePages(
          [await this.fetchIssuePage(options, undefined, limit)],
          limit,
        );
      }
    }
  }

  private async fetchIssuePage(
    options: IssueFetchOptions,
    search: string | undefined,
    limit: number,
  ): Promise<RawGithubIssue[]> {
    const args = ['issue', 'list', '--json', 'number,title,body,labels,state,url,createdAt,updatedAt'];

    if (options.repo) {
      args.push('--repo', options.repo);
    }

    if (options.label) {
      for (const l of options.label) {
        args.push('--label', l);
      }
    }

    if (options.milestone) {
      args.push('--milestone', options.milestone);
    }

    if (search) {
      args.push('--search', search);
    }

    if (options.assignee) {
      args.push('--assignee', options.assignee);
    }

    args.push('--limit', String(limit));

    const maxPayloadBytes = Math.min(
      Math.max(MIN_ISSUE_FETCH_BUFFER_BYTES, limit * APPROX_MAX_GITHUB_ISSUE_BODY_BYTES),
      MAX_ISSUE_FETCH_BUFFER_BYTES,
    );

    const stdout = await this.run('gh', args, maxPayloadBytes);
    return parseSafeJson(stdout, {
      context: 'GitHub issue list payload',
      maxBytes: maxPayloadBytes,
      maxDepth: 48,
      maxContainers: Math.max(limit * 128, 20_000),
      maxObjectKeys: 100_000,
      maxArrayItems: Math.max(limit * 128, 2_000),
    }) as RawGithubIssue[];
  }

  private mergeIssuePages(pages: readonly RawGithubIssue[][], limit?: number): RawGithubIssue[] {
    const byNumber = new Map<number, RawGithubIssue>();
    for (const page of pages) {
      for (const issue of page) {
        if (!byNumber.has(issue.number)) {
          byNumber.set(issue.number, issue);
        }
      }
    }
    const merged = [...byNumber.values()].sort((a, b) => this.compareIssueFetchOrder(a, b));
    return limit === undefined ? merged : merged.slice(0, limit);
  }

  private compareIssueFetchOrder(a: RawGithubIssue, b: RawGithubIssue): number {
    return this.issueBlockerRank(a) - this.issueBlockerRank(b)
      || this.issueEffectivePriorityRank(a) - this.issueEffectivePriorityRank(b)
      || this.issueCreatedAtMs(a) - this.issueCreatedAtMs(b)
      || a.number - b.number;
  }

  private issueBlockerRank(issue: RawGithubIssue): number {
    const labels = issue.labels.map((label) => label.name.trim().toLowerCase());
    if (labels.some((label) => ['hitl', 'human-in-the-loop', 'needs-input', 'needs_input', 'needs-human', 'review-required'].includes(label)
      || ['status:hitl', 'status:needs-input', 'status:review-required'].includes(label))) {
      return 1;
    }
    if (labels.some((label) => ['blocked', 'blocked_status', 'parked', 'paused'].includes(label)
      || ['status:blocked', 'status:paused', 'status:parked'].includes(label))) {
      return 2;
    }
    return 0;
  }

  private issueEffectivePriorityRank(issue: RawGithubIssue): number {
    const priorityRank = this.issuePriorityRank(issue);
    if (priorityRank === 0 || priorityRank === DEFAULT_ISSUE_FETCH_PRIORITY_RANK) {
      return priorityRank;
    }
    const ageBoost = Math.min(
      ISSUE_FETCH_MAX_PRIORITY_AGE_BOOST,
      Math.floor(this.issueAgeDays(issue) / ISSUE_FETCH_PRIORITY_AGING_DAYS_PER_RANK),
    );
    return Math.max(1, priorityRank - ageBoost);
  }

  private issuePriorityRank(issue: RawGithubIssue): number {
    return issue.labels.reduce((best, label) => {
      const rank = ISSUE_FETCH_PRIORITY_RANKS[label.name.toLowerCase()] ?? DEFAULT_ISSUE_FETCH_PRIORITY_RANK;
      return Math.min(best, rank);
    }, DEFAULT_ISSUE_FETCH_PRIORITY_RANK);
  }

  private issueAgeDays(issue: RawGithubIssue): number {
    const createdAtMs = this.issueCreatedAtMs(issue);
    if (createdAtMs === Number.MAX_SAFE_INTEGER) return 0;
    return Math.max(0, Math.floor((Date.now() - createdAtMs) / ISSUE_FETCH_ONE_DAY_MS));
  }

  private issueCreatedAtMs(issue: RawGithubIssue): number {
    if (!issue.createdAt) return Number.MAX_SAFE_INTEGER;
    const parsed = Date.parse(issue.createdAt);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  private isUnsupportedAdvancedSearchError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('search')
      && (message.includes('advanced') || message.includes('unsupported') || message.includes('not supported'));
  }

  async inferRepo(): Promise<string> {
    const stdout = await this.run('gh', ['repo', 'view', '--json', 'nameWithOwner'], 16_384);
    const parsed = parseSafeJson(stdout, {
      context: 'GitHub repository payload',
      maxBytes: 16_384,
      maxDepth: 8,
      maxContainers: 20,
      maxObjectKeys: 50,
      maxArrayItems: 10,
    }) as { nameWithOwner: string };
    return parsed.nameWithOwner;
  }

  private run(file: string, args: string[], maxBuffer: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const callback = (error: Error | null, stdout: string, stderr: string): void => {
        if (error) {
          const message = this.describeError(stderr);
          reject(new Error(message, { cause: error }));
          return;
        }
        resolve(stdout);
      };

      if (this.execFn) {
        this.execFn(file, args, callback);
        return;
      }

      defaultExecFile(file, args, { maxBuffer }, callback);
    });
  }

  private describeError(stderr: string): string {
    if (stderr.includes('gh auth login')) {
      return `GitHub CLI not authenticated. Run: gh auth login\nstderr: ${stderr}`;
    }
    if (stderr.includes('not a git repository')) {
      return `not a git repository — run this command from within a git repo\nstderr: ${stderr}`;
    }
    if (stderr.includes('HTTP 404')) {
      return `HTTP 404: repository not found or not accessible\nstderr: ${stderr}`;
    }
    return `gh command failed: ${stderr}`;
  }
}
