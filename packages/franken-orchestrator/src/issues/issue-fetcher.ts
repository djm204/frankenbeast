import { execFile as defaultExecFile } from 'node:child_process';
import type { GithubIssue, IIssueFetcher, IssueFetchOptions } from './types.js';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFn = (file: string, args: string[], callback: ExecCallback) => void;

interface RawGithubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
  readonly state: string;
  readonly url: string;
}

export class IssueFetcher implements IIssueFetcher {
  private readonly execFn: ExecFn;

  constructor(execFn?: ExecFn) {
    this.execFn = execFn ?? defaultExecFile;
  }

  async fetch(options: IssueFetchOptions): Promise<GithubIssue[]> {
    const args = ['issue', 'list', '--json', 'number,title,body,labels,state,url'];

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
    }

    if (options.assignee) {
      args.push('--assignee', options.assignee);
    }

    const limit = options.limit ?? 30;
    args.push('--limit', String(limit));

    const stdout = await this.run('gh', args);
    const raw: RawGithubIssue[] = JSON.parse(stdout) as RawGithubIssue[];

    if (raw.length === 0) {
      throw new Error('No issues found matching the provided filters');
    }

    return raw.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      labels: issue.labels.map((l) => l.name),
      state: issue.state,
      url: issue.url,
    }));
  }

  async inferRepo(): Promise<string> {
    const stdout = await this.run('gh', ['repo', 'view', '--json', 'nameWithOwner']);
    const parsed = JSON.parse(stdout) as { nameWithOwner: string };
    return parsed.nameWithOwner;
  }

  private run(file: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      this.execFn(file, args, (error, stdout, stderr) => {
        if (error) {
          const message = this.describeError(stderr);
          reject(new Error(message, { cause: error }));
          return;
        }
        resolve(stdout);
      });
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
