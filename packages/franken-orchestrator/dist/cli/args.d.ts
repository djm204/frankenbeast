export type Subcommand = 'interview' | 'plan' | 'run' | 'issues' | undefined;
export interface CliArgs {
    subcommand: Subcommand;
    baseDir: string;
    baseBranch?: string | undefined;
    budget: number;
    provider: string;
    providers?: string[] | undefined;
    designDoc?: string | undefined;
    planDir?: string | undefined;
    noPr: boolean;
    verbose: boolean;
    reset: boolean;
    resume: boolean;
    cleanup: boolean;
    config?: string | undefined;
    help: boolean;
    issueLabel?: string[] | undefined;
    issueMilestone?: string | undefined;
    issueSearch?: string | undefined;
    issueAssignee?: string | undefined;
    issueLimit?: number | undefined;
    issueRepo?: string | undefined;
    dryRun?: boolean | undefined;
}
export declare function printUsage(): void;
export declare function parseArgs(argv?: string[]): CliArgs;
//# sourceMappingURL=args.d.ts.map