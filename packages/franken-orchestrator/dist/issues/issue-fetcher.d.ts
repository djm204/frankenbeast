import type { GithubIssue, IIssueFetcher, IssueFetchOptions } from './types.js';
type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFn = (file: string, args: string[], callback: ExecCallback) => void;
export declare class IssueFetcher implements IIssueFetcher {
    private readonly execFn;
    constructor(execFn?: ExecFn);
    fetch(options: IssueFetchOptions): Promise<GithubIssue[]>;
    inferRepo(): Promise<string>;
    private run;
    private describeError;
}
export {};
//# sourceMappingURL=issue-fetcher.d.ts.map