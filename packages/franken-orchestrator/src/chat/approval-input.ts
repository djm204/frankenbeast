import type { PendingApproval } from '@franken/types';

export function approvalRuntimeInput(pendingApproval: PendingApproval | null | undefined): string {
  const approvedAction = pendingApproval?.command ?? pendingApproval?.description;
  return approvedAction ? `/run ${approvedAction}` : '/approve';
}
