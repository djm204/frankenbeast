import type { TaskId } from './ids.js';
/**
 * Chain-of-thought rationale block produced by the planner's CoT gate.
 * Consumed by the governor for approval decisions.
 */
export interface RationaleBlock {
    taskId: TaskId;
    reasoning: string;
    selectedTool?: string;
    expectedOutcome: string;
    timestamp: Date;
}
/**
 * Result of rationale verification by the governor.
 */
export type VerificationResult = {
    verdict: 'approved';
} | {
    verdict: 'rejected';
    reason: string;
};
//# sourceMappingURL=rationale.d.ts.map