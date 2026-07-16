import { execFile as defaultExecFile } from 'node:child_process';
import { parseSafeJson } from '../utils/safe-json.js';
import type { GithubIssue, IIssueFetcher, IssueFetchOptions } from './types.js';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFn = (file: string, args: string[], callback: ExecCallback) => void;

const DEFAULT_ISSUE_FETCH_LIMIT = 1_000;
const MIN_ISSUE_FETCH_BUFFER_BYTES = 2_097_152;
const MAX_ISSUE_FETCH_BUFFER_BYTES = 128 * 1_024 * 1_024;
const APPROX_MAX_GITHUB_ISSUE_BODY_BYTES = 65_536;

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

    if (options.search) {
      args.push('--search', options.search);
    } else {
      args.push('--search', 'sort:created-asc');
    }

    if (options.assignee) {
      args.push('--assignee', options.assignee);
    }

    const limit = options.limit ?? DEFAULT_ISSUE_FETCH_LIMIT;
    args.push('--limit', String(limit));

    const maxPayloadBytes = Math.min(
      Math.max(MIN_ISSUE_FETCH_BUFFER_BYTES, limit * APPROX_MAX_GITHUB_ISSUE_BODY_BYTES),
      MAX_ISSUE_FETCH_BUFFER_BYTES,
    );

    const stdout = await this.run('gh', args, maxPayloadBytes);
    const raw = parseSafeJson(stdout, {
      context: 'GitHub issue list payload',
      maxBytes: maxPayloadBytes,
      maxDepth: 48,
      maxContainers: 20_000,
      maxObjectKeys: 100_000,
      maxArrayItems: Math.max(limit * 64, 2_000),
    }) as RawGithubIssue[];

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
