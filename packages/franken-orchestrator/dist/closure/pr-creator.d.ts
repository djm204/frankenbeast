import type { ILlmClient } from '@franken/types';
import type { BeastResult } from '../types.js';
import type { ILogger } from '../deps.js';
export interface PrCreatorConfig {
    readonly targetBranch: string;
    readonly disabled: boolean;
    readonly remote: string;
}
export interface PrCreateOptions {
    readonly issueNumber?: number | undefined;
}
type ExecFn = (cmd: string) => string;
export declare class PrCreator {
    private readonly config;
    private readonly exec;
    private readonly llm?;
    constructor(config: PrCreatorConfig, exec?: ExecFn, llm?: ILlmClient);
    generateCommitMessage(diffStat: string, chunkObjective: string): Promise<string | null>;
    generatePrDescription(commitLog: string, diffStat: string, result: BeastResult, issueNumber?: number): Promise<{
        title: string;
        body: string;
    } | null>;
    create(result: BeastResult, logger?: ILogger, options?: PrCreateOptions): Promise<{
        url: string;
    } | null>;
    private safeExec;
    private pushBranch;
    private findExistingPr;
    private tryGeneratePrFromLlm;
    private gatherGitContext;
}
export {};
//# sourceMappingURL=pr-creator.d.ts.map