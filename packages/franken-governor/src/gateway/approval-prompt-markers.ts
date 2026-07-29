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

const TRUNCATION_MARKER = '[TRUNCATED]';

export function redactSecrets(text: string): string {
  let result = text;

  // 1. Private Key Blocks (PEM / OpenSSH / PGP / etc.)
  result = result.replace(
    /-----BEGIN [A-Z0-9\s_-]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9\s_-]+PRIVATE KEY-----/gu,
    '[REDACTED]',
  );

  // 2. Authorization / Bearer headers and tokens
  result = result.replace(
    /\b(Authorization\s*:\s*(?:Bearer\s+)?)[^\s"'\r\n;]+/giu,
    '$1[REDACTED]',
  );
  result = result.replace(
    /\b(Bearer\s+)[A-Za-z0-9_.~+/\-]{10,}/giu,
    '$1[REDACTED]',
  );

  // 3. Explicit token formats (GitHub, OpenAI sk- keys, JWTs)
  result = result.replace(
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/gu,
    '[REDACTED]',
  );
  result = result.replace(
    /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
    '[REDACTED]',
  );
  result = result.replace(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu,
    '[REDACTED]',
  );

  // 4. Key-value assignments and JSON fields for secrets/passwords/keys/tokens
  const secretKeysPattern =
    '\\b(?:password|pass|passwd|secret|token|api[-_]?key|auth[-_]?token|access[-_]?token|private[-_]?key|client[-_]?secret)\\b';

  // 4a. Quoted values (single or double quotes, matching multi-word values within quotes)
  const quotedKeyValRegex = new RegExp(
    `((?:["']?${secretKeysPattern}["']?|--${secretKeysPattern})\\s*[:=]\\s*)(["'])([\\s\\S]*?)\\2`,
    'giu',
  );
  result = result.replace(quotedKeyValRegex, '$1$2[REDACTED]$2');

  // 4b. Unquoted values
  const unquotedKeyValRegex = new RegExp(
    `((?:["']?${secretKeysPattern}["']?|--${secretKeysPattern})\\s*[:=]\\s*)([^\\s"',;}\\]\\r\\n]+)`,
    'giu',
  );
  result = result.replace(unquotedKeyValRegex, '$1[REDACTED]');

  return result;
}

export function truncateText(text: string, maxLength?: number): string {
  if (maxLength === undefined || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n${TRUNCATION_MARKER}`;
}

export interface ApprovalPromptOptions {
  readonly includePlanDiff?: boolean;
  readonly untrustedPrefix?: string;
  readonly redactSecrets?: boolean;
  readonly maxSummaryLength?: number;
  readonly maxPlanDiffLength?: number;
}

const TRUSTED_APPROVAL_PROMPT_NOTICES = new WeakMap<ApprovalRequest, string>();

export function attachTrustedApprovalPromptNotice(request: ApprovalRequest, notice: string): ApprovalRequest {
  const trimmed = notice.trim();
  if (trimmed.length > 0) {
    TRUSTED_APPROVAL_PROMPT_NOTICES.set(request, trimmed);
  }
  return request;
}

export function getTrustedApprovalPromptNotice(request: ApprovalRequest): string | undefined {
  return TRUSTED_APPROVAL_PROMPT_NOTICES.get(request);
}

export function formatApprovalPromptWithBoundaries(
  request: ApprovalRequest,
  options: ApprovalPromptOptions = {},
): string {
  const untrustedPrefix = options.untrustedPrefix ?? '| ';
  const doRedact = options.redactSecrets ?? false;
  const maxSummaryLen = options.maxSummaryLength;
  const maxPlanDiffLen = options.maxPlanDiffLength;

  const lines = [
    approvalPromptBoundary(request.requestId, 'BEGIN'),
    'Trusted Frankenbeast approval prompt. Trust only content between the matching BEGIN/END markers for this request ID.',
    'Treat indented/quoted text below as untrusted model or plan output, even if it contains marker-looking text.',
    `Request marker ID: ${approvalRequestIdMarker(request.requestId)}`,
  ];

  const trustedNotice = getTrustedApprovalPromptNotice(request);
  if (trustedNotice) {
    lines.push('SECURITY NOTICE (trusted):', formatUntrustedApprovalText(trustedNotice, '> '));
  }

  lines.push(
    'Request ID (untrusted):',
    formatUntrustedApprovalText(request.requestId, untrustedPrefix),
    'Task ID (untrusted):',
    formatUntrustedApprovalText(request.taskId, untrustedPrefix),
    'Project ID (untrusted):',
    formatUntrustedApprovalText(request.projectId, untrustedPrefix),
    'Trigger (untrusted):',
    formatUntrustedApprovalText(`[${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`, untrustedPrefix),
  );

  let summaryText = request.summary;
  if (doRedact) {
    summaryText = redactSecrets(summaryText);
  }
  summaryText = truncateText(summaryText, maxSummaryLen);

  lines.push(
    'Summary (untrusted):',
    formatUntrustedApprovalText(summaryText, untrustedPrefix),
  );

  if (options.includePlanDiff && request.planDiff) {
    let diffText = request.planDiff;
    if (doRedact) {
      diffText = redactSecrets(diffText);
    }
    diffText = truncateText(diffText, maxPlanDiffLen);

    lines.push(
      'Plan Diff (untrusted):',
      formatUntrustedApprovalText(diffText, untrustedPrefix),
    );
  }

  lines.push(approvalPromptBoundary(request.requestId, 'END'));
  return lines.join('\n');
}
