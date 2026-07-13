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
  /**
   * Optional operator session token id from a prior approval. Governors must
   * validate the token against the risky action scope and expiry before using
   * it to bypass a fresh operator prompt.
   */
  approvalSessionTokenId?: string;
}

/**
 * Result of rationale verification by the governor.
 */
export type VerificationResult =
  | { verdict: 'approved'; approvalSessionTokenId?: string }
  | { verdict: 'rejected'; reason: string };
