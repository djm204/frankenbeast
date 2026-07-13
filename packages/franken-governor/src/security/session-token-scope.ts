import type { ApprovalRequest } from '../core/types.js';

/**
 * Build the canonical operator-session scope for a governor approval request.
 *
 * The scope deliberately includes project and trigger/policy identity. Skill
 * approvals are scoped to the selected tool, while non-skill policy approvals
 * stay task-scoped so a budget/custom approval for one task cannot authorize a
 * later unrelated task that happens to use the same tool.
 */
export function formatApprovalSessionTokenScope(request: ApprovalRequest): string {
  return formatSessionTokenScope({
    projectId: request.projectId,
    triggerId: request.trigger.triggerId,
    actionScope: isSkillApprovalTrigger(request.trigger.triggerId) && request.skillId !== undefined
      ? request.skillId
      : request.taskId,
  });
}

function isSkillApprovalTrigger(triggerId: string): boolean {
  return triggerId === 'skill' || triggerId === 'hitl_required';
}

export interface SessionTokenScopeFields {
  readonly projectId: string;
  readonly triggerId: string;
  readonly actionScope: string;
}

export function formatSessionTokenScope(fields: SessionTokenScopeFields): string {
  return [fields.projectId, fields.triggerId, fields.actionScope]
    .map((value) => encodeURIComponent(value))
    .join(':');
}
