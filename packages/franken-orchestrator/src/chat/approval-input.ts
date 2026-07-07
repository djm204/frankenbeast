import type { PendingApproval } from '@franken/types';

export function approvalRuntimeInput(pendingApproval: PendingApproval | null | undefined): string {
  return pendingApproval?.command ? `/run ${pendingApproval.command}` : '/approve';
}
