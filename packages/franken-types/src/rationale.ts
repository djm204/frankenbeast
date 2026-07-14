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
  /**
   * Candidate operator session token ids from prior approvals. This lets a
   * planner carry tokens for several scopes at once; governors validate each
   * candidate against the current request before reuse.
   */
  approvalSessionTokenIds?: readonly string[];
  /**
   * Optional confidence score from a planner or caller that wants the governor's
   * confidence trigger evaluated against this rationale.
   */
  confidenceScore?: number;
  /** Optional ambiguity signals for the governor's ambiguity trigger. */
  hasUnresolvedDependency?: boolean;
  hasAdrConflict?: boolean;
}

/**
 * Result of rationale verification by the governor.
 */
export type VerificationResult =
  | { verdict: 'approved'; approvalSessionTokenId?: string; approvalSessionTokenTriggerId?: string }
  | { verdict: 'rejected'; reason: string };
