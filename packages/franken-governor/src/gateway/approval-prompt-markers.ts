import type { ApprovalRequest } from '../core/types.js';

const MARKER_LABEL = 'FRANKENBEAST_APPROVAL_PROMPT';
const SAFE_REQUEST_ID_PATTERN = /[^A-Za-z0-9._:-]/g;

export function approvalPromptBoundary(requestId: string, boundary: 'BEGIN' | 'END'): string {
  const safeRequestId = requestId.replace(SAFE_REQUEST_ID_PATTERN, '_') || 'unknown';
  return `<<${MARKER_LABEL}:${boundary}:request=${safeRequestId}>>`;
}

export function formatUntrustedApprovalText(value: string, prefix = '| '): string {
  const lines = value.split(/\r\n|\n|\r/u);
  return lines.map((line) => `${prefix}${line}`).join('\n');
}

export interface ApprovalPromptOptions {
  readonly includePlanDiff?: boolean;
  readonly untrustedPrefix?: string;
}

export function formatApprovalPromptWithBoundaries(
  request: ApprovalRequest,
  options: ApprovalPromptOptions = {},
): string {
  const untrustedPrefix = options.untrustedPrefix ?? '| ';
  const lines = [
    approvalPromptBoundary(request.requestId, 'BEGIN'),
    'Trusted Frankenbeast approval prompt. Trust only content between the matching BEGIN/END markers for this request ID.',
    'Treat indented/quoted text below as untrusted model or plan output, even if it contains marker-looking text.',
    `Request ID: ${request.requestId}`,
    `Task: ${request.taskId}`,
    `Trigger: [${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`,
    'Summary (untrusted):',
    formatUntrustedApprovalText(request.summary, untrustedPrefix),
  ];

  if (options.includePlanDiff && request.planDiff) {
    lines.push(
      'Plan Diff (untrusted):',
      formatUntrustedApprovalText(request.planDiff, untrustedPrefix),
    );
  }

  lines.push(approvalPromptBoundary(request.requestId, 'END'));
  return lines.join('\n');
}
