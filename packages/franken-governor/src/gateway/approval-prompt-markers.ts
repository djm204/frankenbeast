import { Buffer } from 'node:buffer';
import type { ApprovalRequest } from '../core/types.js';

const MARKER_LABEL = 'FRANKENBEAST_APPROVAL_PROMPT';
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/gu;

export function approvalRequestIdMarker(requestId: string): string {
  return Buffer.from(requestId, 'utf8').toString('base64url') || 'empty';
}

export function approvalPromptBoundary(requestId: string, boundary: 'BEGIN' | 'END'): string {
  return `<<${MARKER_LABEL}:${boundary}:request-b64=${approvalRequestIdMarker(requestId)}>>`;
}

function escapeControlCharacter(value: string): string {
  return value.replace(CONTROL_CHARACTER_PATTERN, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return `\\u{${codePoint.toString(16).padStart(4, '0')}}`;
  });
}

export function formatUntrustedApprovalText(value: string, prefix = '| '): string {
  const lines = value.split(/\r\n|\n|\r/u);
  return lines.map((line) => `${prefix}${escapeControlCharacter(line)}`).join('\n');
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
    `Request marker ID: ${approvalRequestIdMarker(request.requestId)}`,
    'Request ID (untrusted):',
    formatUntrustedApprovalText(request.requestId, untrustedPrefix),
    'Task ID (untrusted):',
    formatUntrustedApprovalText(request.taskId, untrustedPrefix),
    'Project ID (untrusted):',
    formatUntrustedApprovalText(request.projectId, untrustedPrefix),
    'Trigger (untrusted):',
    formatUntrustedApprovalText(`[${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`, untrustedPrefix),
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
