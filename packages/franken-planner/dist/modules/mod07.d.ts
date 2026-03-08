import type { RationaleBlock, VerificationResult } from '../core/types.js';
/**
 * MOD-07: Self-Critique
 * Receives a RationaleBlock from the planner and verifies the agent's
 * reasoning before task execution proceeds.
 */
export interface SelfCritiqueModule {
    verifyRationale(rationale: RationaleBlock): Promise<VerificationResult>;
}
//# sourceMappingURL=mod07.d.ts.map