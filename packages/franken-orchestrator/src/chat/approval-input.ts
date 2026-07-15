import type { PendingApproval } from '@franken/types';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const MAX_PENDING_APPROVAL_COMMAND_LENGTH = 4_096;

export class UnsafeApprovalCommandError extends Error {
  constructor() {
    super(
      'Unsafe pending approval command: approval-parser rejected pending-command input; approve only bounded single-line command text, or reject and re-run explicitly to override.',
    );
    this.name = 'UnsafeApprovalCommandError';
  }
}

function normalizePendingCommand(command: string): string {
  if (command.length > MAX_PENDING_APPROVAL_COMMAND_LENGTH) {
    throw new UnsafeApprovalCommandError();
  }
  if (CONTROL_CHARACTER_PATTERN.test(command)) {
    throw new UnsafeApprovalCommandError();
  }
  const normalized = command.trim();
  if (
    normalized.length === 0
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
