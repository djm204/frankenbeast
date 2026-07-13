import type { ApprovalRequest } from '../core/types.js';

/**
 * Build the canonical operator-session scope for a governor approval request.
 *
 * The scope deliberately includes project and trigger/policy identity in
 * addition to the selected tool/task so a bearer token approved for one project
 * or risk policy cannot authorize another.
 */
export function formatApprovalSessionTokenScope(request: ApprovalRequest): string {
  return formatSessionTokenScope({
    projectId: request.projectId,
    triggerId: request.trigger.triggerId,
    actionScope: request.skillId ?? request.taskId,
  });
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
