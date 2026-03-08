import type { GuardrailsPort, MemoryPort, ObservabilityPort } from './types/contracts.js';
import type { EvaluationInput } from './types/evaluation.js';
import type { LoopConfig, CritiqueLoopResult } from './types/loop.js';
export interface ReviewerConfig {
    readonly guardrails: GuardrailsPort;
    readonly memory: MemoryPort;
    readonly observability: ObservabilityPort;
    readonly knownPackages: readonly string[];
}
export interface Reviewer {
    review(input: EvaluationInput, loopConfig: LoopConfig): Promise<CritiqueLoopResult>;
}
export declare function createReviewer(config: ReviewerConfig): Reviewer;
//# sourceMappingURL=reviewer.d.ts.map