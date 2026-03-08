import type { TaskId } from '../core/types.js';

/** A partial update to an existing task's mutable fields. */
export interface TaskModification {
  taskId: TaskId;
  objective?: string;
  requiredSkills?: string[];
}

/**
 * Outcome of a HITL approval request (ADR-006).
 * approved  — proceed immediately.
 * modified  — apply TaskModification[] to the plan, then proceed.
 * aborted   — stop; surface reason in PlanResult.
 */
export type ApprovalResult =
  | { decision: 'approved' }
  | { decision: 'modified'; changes: TaskModification[] }
  | { decision: 'aborted'; reason: string };

/**
 * Gate that presents a plan to a human and waits for their decision.
 * No UI code lives inside src/hitl/ — the gate is injected at the boundary.
 */
export interface HITLGate {
  requestApproval(markdown: string): Promise<ApprovalResult>;
}
