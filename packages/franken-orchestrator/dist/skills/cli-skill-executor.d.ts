import type { MartinLoopConfig, CliSkillConfig } from './cli-types.js';
import type { SkillInput, SkillResult, ICheckpointStore, ILogger } from '../deps.js';
import type { MartinLoop } from './martin-loop.js';
import type { GitBranchIsolator } from './git-branch-isolator.js';
export declare function formatIterationProgress(opts: {
    chunkId: string;
    iteration: number;
    maxIterations: number;
    durationMs?: number;
    tokensEstimated?: number;
}): string;
export declare function writeProgress(line: string, opts: {
    final: boolean;
    isTTY?: boolean;
    write?: (s: string) => void;
}): void;
export interface Span {
    readonly id: string;
}
export interface Trace {
    readonly id: string;
}
export interface TokenTotals {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
}
export interface TokenRecord {
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
}
export interface TokenUsage {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly model?: string;
}
export interface TokenCounter {
    grandTotal(): TokenTotals;
    allModels(): string[];
    totalsFor(model: string): TokenTotals;
}
export interface CostCalculator {
    totalCost(entries: TokenRecord[]): number;
}
export interface CircuitBreakerResult {
    readonly tripped: boolean;
    readonly limitUsd: number;
    readonly spendUsd: number;
}
export interface CircuitBreaker {
    check(spendUsd: number): CircuitBreakerResult;
}
export interface LoopDetector {
    check(spanName: string): {
        detected: boolean;
    };
}
export interface ObserverDeps {
    readonly trace: Trace;
    readonly counter: TokenCounter;
    readonly costCalc: CostCalculator;
    readonly breaker: CircuitBreaker;
    readonly loopDetector: LoopDetector;
    startSpan(trace: Trace, opts: {
        name: string;
        parentSpanId?: string;
    }): Span;
    endSpan(span: Span, opts?: {
        status?: string;
        errorMessage?: string;
    }, loopDetector?: LoopDetector): void;
    recordTokenUsage(span: Span, usage: TokenUsage, counter?: TokenCounter): void;
    setMetadata(span: Span, data: Record<string, unknown>): void;
}
export declare class BudgetExceededError extends Error {
    readonly spent: number;
    readonly limit: number;
    constructor(spent: number, limit: number);
}
type CommitMessageFn = (diffStat: string, objective: string) => Promise<string | null>;
type DefaultMartinConfig = Pick<MartinLoopConfig, 'provider'> & Partial<Pick<MartinLoopConfig, 'command' | 'providers'>>;
export declare class CliSkillExecutor {
    private readonly martin;
    private readonly git;
    private readonly observer;
    private readonly verifyCommand?;
    private readonly commitMessageFn?;
    private readonly logger?;
    private readonly defaultMartinConfig;
    constructor(martin: MartinLoop, git: GitBranchIsolator, observer: ObserverDeps, verifyCommand?: string, commitMessageFn?: CommitMessageFn, logger?: ILogger, defaultMartinConfig?: DefaultMartinConfig);
    recoverDirtyFiles(taskId: string, stage: string, checkpoint: ICheckpointStore, logger?: ILogger): Promise<'clean' | 'committed' | 'reset'>;
    execute(skillId: string, input: SkillInput, config: CliSkillConfig, checkpoint?: ICheckpointStore, taskId?: string): Promise<SkillResult>;
    private attemptConflictResolution;
    private extractChunkId;
    private computeCurrentCost;
}
export {};
//# sourceMappingURL=cli-skill-executor.d.ts.map