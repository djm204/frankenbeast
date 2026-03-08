import type { ICritiqueModule, CritiqueResult, PlanGraph } from '../deps.js';
export interface EvaluationInput {
    readonly content: string;
    readonly source?: string | undefined;
    readonly metadata: Readonly<Record<string, unknown>>;
}
export interface EvaluationFinding {
    readonly message: string;
    readonly severity: string;
}
export interface EvaluationResult {
    readonly evaluatorName: string;
    readonly verdict: string;
    readonly score: number;
    readonly findings: readonly EvaluationFinding[];
}
export interface LoopCritiqueResult {
    readonly verdict: string;
    readonly overallScore: number;
    readonly results: readonly EvaluationResult[];
    readonly shortCircuited: boolean;
}
export interface CritiqueIteration {
    readonly index: number;
    readonly input: EvaluationInput;
    readonly result: LoopCritiqueResult;
    readonly completedAt: string;
}
export interface CorrectionRequest {
    readonly summary: string;
    readonly findings: readonly EvaluationFinding[];
    readonly score: number;
    readonly iterationCount: number;
}
export interface EscalationRequest {
    readonly reason: string;
}
export type CritiqueLoopResult = {
    readonly verdict: 'pass';
    readonly iterations: readonly CritiqueIteration[];
} | {
    readonly verdict: 'fail';
    readonly iterations: readonly CritiqueIteration[];
    readonly correction: CorrectionRequest;
} | {
    readonly verdict: 'halted';
    readonly iterations: readonly CritiqueIteration[];
    readonly reason: string;
} | {
    readonly verdict: 'escalated';
    readonly iterations: readonly CritiqueIteration[];
    readonly escalation: EscalationRequest;
};
export interface LoopConfig {
    readonly maxIterations: number;
    readonly tokenBudget: number;
    readonly consensusThreshold: number;
    readonly sessionId: string;
    readonly taskId: string;
}
export interface CritiqueLoopPort {
    run(input: EvaluationInput, config: LoopConfig): Promise<CritiqueLoopResult>;
}
export interface CritiquePortAdapterConfig {
    readonly loop: CritiqueLoopPort;
    readonly config: LoopConfig;
    readonly source?: string | undefined;
}
export declare class CritiquePortAdapter implements ICritiqueModule {
    private readonly loop;
    private readonly config;
    private readonly source?;
    constructor(config: CritiquePortAdapterConfig);
    reviewPlan(plan: PlanGraph, context?: unknown): Promise<CritiqueResult>;
    private mapResult;
    private mapFindings;
}
//# sourceMappingURL=critique-adapter.d.ts.map