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
const ANSI_PATTERN = '(?:(?:\\\\u001b|\\u001b|\\x1b)\\[[0-9;]*m)*';
const SENSITIVE_KEY_PATTERN =
  '(?:[A-Za-z0-9_]*[-_])?(?:password|passwd|secret|token|api[-_]?key|auth[-_]?token|access[-_]?token|access[-_]?key|private[-_]?key|client[-_]?secret)(?:[-_][A-Za-z0-9_]*|\\d+)*\\b';
const shellExprLookahead = '(?!\\\[REDACTED\\\]|\`|\\$\\(|\\$\\{|<\\(|>\\()';
const keyBoundary = '(?:^|\\s|\\b)';

export function redactSecrets(text: string): string {
  let result = text;

  // 1. Private Key Blocks with EXACT matching BEGIN/END labels containing PRIVATE KEY
  result = result.replace(
    /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----[\s\S]*?-----END \1-----/giu,
    '[REDACTED]',
  );

  // 2. Authorization headers inside quoted shell arguments:
  // e.g. curl -H 'Authorization: Bearer token' https://safe.example && rm -rf /
  result = result.replace(
    /\b(Authorization\s*:\s*)[^"'\r\n]+(["'])/giu,
    '$1[REDACTED]$2',
  );

  // 3. Standalone Authorization headers outside quotes (entire line value)
  result = result.replace(
    /(^|\n|\r)(\s*Authorization\s*:\s*)[^\r\n]+/giu,
    '$1$2[REDACTED]',
  );

  // 4. Standalone Bearer tokens outside Authorization header
  result = result.replace(
    /\b(Bearer\s+)[A-Za-z0-9_.~+/\-]{10,}/giu,
    '$1[REDACTED]',
  );

  // 5. Explicit token formats (GitHub tokens, OpenAI sk- keys, JWTs)
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

  // 6. Quoted key-value assignments and JSON fields (handling escaped quotes and ANSI escapes)
  const doubleQuotedRegex = new RegExp(
    `(${keyBoundary}${ANSI_PATTERN}(?:["']?${SENSITIVE_KEY_PATTERN}["']?|--(?:password|secret|token|api[-_]?key|access[-_]?key))${ANSI_PATTERN}\\s*[:=]\\s*)"((?:\\\\.|[^"\\\\])*)"`,
    'giu',
  );
  result = result.replace(doubleQuotedRegex, '$1"[REDACTED]"');

  const singleQuotedRegex = new RegExp(
    `(${keyBoundary}${ANSI_PATTERN}(?:["']?${SENSITIVE_KEY_PATTERN}["']?|--(?:password|secret|token|api[-_]?key|access[-_]?key))${ANSI_PATTERN}\\s*[:=]\\s*)'((?:\\\\.|[^'\\\\])*)'`,
    'giu',
  );
  result = result.replace(singleQuotedRegex, "$1'[REDACTED]'");

  // 7. Space-separated CLI flags (quote-aware and stopping at shell control operators)
  const flagToken = '--(?:password|secret|token|api[-_]?key|access[-_]?key)';
  const spaceFlagDoubleQuotedRegex = new RegExp(
    `(${flagToken}\\s+)"((?:\\\\.|[^"\\\\])*)"`,
    'giu',
  );
  result = result.replace(spaceFlagDoubleQuotedRegex, '$1"[REDACTED]"');

  const spaceFlagSingleQuotedRegex = new RegExp(
    `(${flagToken}\\s+)'((?:\\\\.|[^'\\\\])*)'`,
    'giu',
  );
  result = result.replace(spaceFlagSingleQuotedRegex, "$1'[REDACTED]'");

  const spaceFlagUnquotedRegex = new RegExp(
    `(${flagToken}\\s+)${shellExprLookahead}([^\\s"',;}\\]\\r\\n&|><]+)`,
    'giu',
  );
  result = result.replace(spaceFlagUnquotedRegex, '$1[REDACTED]');

  // 8. YAML / unquoted key-value assignments (single-line only, preserving inline comments starting with whitespace '#')
  const yamlKeyValRegex = new RegExp(
    `(${keyBoundary}${ANSI_PATTERN}${SENSITIVE_KEY_PATTERN}${ANSI_PATTERN}\\s*:\\s*)(?!["'\\s]|\\\[REDACTED\\\])${shellExprLookahead}([^"\\s'\\r\\n]+(?:[ \\t]+[^"\\s'\\r\\n#]+)*)([ \\t]+#.*)?$`,
    'gimu',
  );
  result = result.replace(
    yamlKeyValRegex,
    (_match, p1, _p2, p3 = '') => `${p1}[REDACTED]${p3.trimEnd()}`,
  );

  // 9. Standard unquoted key-value assignments (ending at whitespace or shell operators/redirections &|;><)
  const unquotedKeyValRegex = new RegExp(
    `(${keyBoundary}${ANSI_PATTERN}${SENSITIVE_KEY_PATTERN}${ANSI_PATTERN}\\s*[:=]\\s*)${shellExprLookahead}([^\\s"',;}\\]\\r\\n&|><]+)`,
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

export function redactAndTruncate(
  text: string,
  options: { redact?: boolean; maxLength?: number | undefined },
): string {
  const doRedact = options.redact ?? false;
  const maxLen = options.maxLength;

  if (!doRedact) {
    return truncateText(text, maxLen);
  }

  // Bound scanning region to avoid quadratic work on large inputs
  const scanLimit = maxLen !== undefined ? maxLen + 2000 : text.length;
  let scanRegion = text.slice(0, scanLimit);

  scanRegion = redactSecrets(scanRegion);

  if (maxLen !== undefined && scanRegion.length > maxLen) {
    const beginRegex = /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----/giu;
    let match: RegExpExecArray | null;
    while ((match = beginRegex.exec(scanRegion.slice(0, maxLen))) !== null) {
      const label = match[1];
      const idx = match.index;
      const endMarker = `-----END ${label}-----`.toLowerCase();
      const remainderFromIdx = scanRegion.slice(idx);
      const remainderLower = remainderFromIdx.toLowerCase();

      const hasMatchingEndInScan = remainderLower.includes(endMarker);
      const hasMismatchedEndInScan = /-----END [^\r\n]*PRIVATE KEY[^\r\n]*-----/iu.test(remainderFromIdx);

      if (!hasMatchingEndInScan && !hasMismatchedEndInScan) {
        return `${scanRegion.slice(0, idx)}[REDACTED]\n${TRUNCATION_MARKER}`;
      }
    }
  }

  return truncateText(scanRegion, maxLen);
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

  const triggerReason = redactAndTruncate(
    `[${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`,
    {
      redact: doRedact,
      maxLength: maxSummaryLen ?? 1000,
    },
  );

  lines.push(
    'Request ID (untrusted):',
    formatUntrustedApprovalText(request.requestId, untrustedPrefix),
    'Task ID (untrusted):',
    formatUntrustedApprovalText(request.taskId, untrustedPrefix),
    'Project ID (untrusted):',
    formatUntrustedApprovalText(request.projectId, untrustedPrefix),
    'Trigger (untrusted):',
    formatUntrustedApprovalText(triggerReason, untrustedPrefix),
  );

  const summaryText = redactAndTruncate(request.summary, {
    redact: doRedact,
    maxLength: maxSummaryLen,
  });

  lines.push(
    'Summary (untrusted):',
    formatUntrustedApprovalText(summaryText, untrustedPrefix),
  );

  if (options.includePlanDiff && request.planDiff) {
    const diffText = redactAndTruncate(request.planDiff, {
      redact: doRedact,
      maxLength: maxPlanDiffLen,
    });

    lines.push(
      'Plan Diff (untrusted):',
      formatUntrustedApprovalText(diffText, untrustedPrefix),
    );
  }

  lines.push(approvalPromptBoundary(request.requestId, 'END'));
  return lines.join('\n');
}
