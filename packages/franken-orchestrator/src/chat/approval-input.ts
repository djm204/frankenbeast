import type { PendingApproval } from '@franken/types';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

export class UnsafeApprovalCommandError extends Error {
  constructor() {
    super('Unsafe pending approval command: approve only single-line command text; reject and re-run explicitly to override.');
    this.name = 'UnsafeApprovalCommandError';
  }
}

function normalizePendingCommand(command: string): string {
  const normalized = command.trim();
  if (
    normalized.length === 0
    || CONTROL_CHARACTER_PATTERN.test(normalized)
    || normalized.startsWith('/')
  ) {
    throw new UnsafeApprovalCommandError();
  }
  return normalized;
}

/**
 * Convert a stored pending approval into the runtime input used after an
 * operator approves it. The stored command is model-derived text, so keep the
 * extraction deliberately narrow: only single-line, printable, non-slash command
 * descriptions are replayed through `/run`. Risky multiline/control-command
 * payloads fail closed; operators can reject and submit a fresh explicit `/run`
 * command when they really intend to override the guard.
 */
export function approvalRuntimeInput(pendingApproval: PendingApproval | null | undefined): string {
  if (!pendingApproval?.command) {
    return '/approve';
  }

  return `/run ${normalizePendingCommand(pendingApproval.command)}`;
}
