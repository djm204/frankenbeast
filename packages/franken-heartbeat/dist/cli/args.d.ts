export interface CliArgs {
    configPath: string | undefined;
    heartbeatFilePath: string | undefined;
    dryRun: boolean;
    projectId: string;
}
export declare function parseArgs(argv: string[]): CliArgs;
//# sourceMappingURL=args.d.ts.map