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
const shellExprLookahead = '(?!\`|\\$\\(|\\$\\{|<\\(|>\\()';

const SENSITIVE_VOCABULARY = [
  'password',
  'passwd',
  'secret',
  'token',
  'api-key',
  'api_key',
  'apikey',
  'auth-token',
  'auth_token',
  'access-token',
  'access_token',
  'access-key',
  'access_key',
  'private-key',
  'private_key',
  'client-secret',
  'client_secret',
  'db-password',
  'db_password',
];

export function isSensitiveKeyToken(token: string): boolean {
  const clean = token
    .replace(/^\\u001b\[[0-9;]*m/g, '')
    .replace(/^\x1b\[[0-9;]*m/g, '')
    .replace(/\\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/^--/, '')
    .replace(/^\$/, '');
  const lower = clean.toLowerCase();

  for (const keyword of SENSITIVE_VOCABULARY) {
    if (lower === keyword) return true;
    const kwPattern = keyword.replace('-', '[-_]');
    const kwRegex = new RegExp(`(?:^|[-_])${kwPattern}(?:$|[-_\\d])`, 'i');
    if (kwRegex.test(lower)) {
      return true;
    }
  }

  return false;
}

export function isShellExpression(val: string): boolean {
  const trimmed = val.trim();
  const content =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return (
    content.startsWith('$(') ||
    content.startsWith('`') ||
    content.startsWith('${') ||
    content.startsWith('<(') ||
    content.startsWith('>(')
  );
}

export function isPlausibleArmoredKeyBody(body: string): boolean {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return true;

  for (const line of lines) {
    if (/^(?:Version|Comment|Proc-Type|DEK-Info|Hash):\s+/i.test(line)) {
      continue;
    }
    if (/^=[A-Za-z0-9+/]{4}$/.test(line)) {
      continue;
    }
    if (line === '...' || line === '…') {
      continue;
    }
    if (/^[A-Za-z0-9+/=]{8,}(?:\.{3}|…)?$/.test(line)) {
      continue;
    }
    return false;
  }

  return true;
}

function redactPrivateKeyBlocks(text: string): string {
  const blockRegex = /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----([\s\S]*?)-----END \1-----/giu;
  return text.replace(blockRegex, (match, _label, body) => {
    if (typeof body === 'string' && isPlausibleArmoredKeyBody(body)) {
      return '[REDACTED]';
    }
    return match;
  });
}

function redactUrlPasswords(text: string): string {
  return text.replace(
    /\b([a-z0-9+.-]+:\/\/(?:[a-zA-Z0-9_%-]+:))([^@/\s]+)(@[a-zA-Z0-9.-]+)/giu,
    '$1[REDACTED]$3',
  );
}

function redactAuthorizationHeaders(text: string): string {
  let result = text;
  result = result.replace(
    /(')Authorization\s*:\s*(?:[^'\r\n]+)\1/giu,
    "$1Authorization: [REDACTED]$1",
  );
  result = result.replace(
    /(")Authorization\s*:\s*(?:[^"\r\n]+)\1/giu,
    '"Authorization: [REDACTED]"',
  );
  result = result.replace(
    /(^|\n|\r)(\s*Authorization\s*:\s*)[^\r\n]+/giu,
    '$1$2[REDACTED]',
  );
  return result;
}

function redactYamlMultilineBlocks(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inRedactedBlock = false;
  let blockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (inRedactedBlock) {
      const matchIndent = line.match(/^(\s*)/);
      const currentIndent = (matchIndent && matchIndent[1]) ? matchIndent[1].length : 0;
      if (line.trim().length > 0 && currentIndent > blockIndent) {
        continue;
      } else {
        inRedactedBlock = false;
      }
    }

    const yamlBlockMatch = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*[|>][-+]?\s*$/);
    if (yamlBlockMatch && yamlBlockMatch[1] !== undefined && yamlBlockMatch[2] !== undefined) {
      const indentStr = yamlBlockMatch[1];
      const key = yamlBlockMatch[2];
      if (isSensitiveKeyToken(key)) {
        out.push(`${indentStr}${key}: [REDACTED]`);
        inRedactedBlock = true;
        blockIndent = indentStr.length;
        continue;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

export function redactSecrets(text: string): string {
  let result = text;

  // 1. Private Key Blocks (plausible key body check)
  result = redactPrivateKeyBlocks(result);

  // 2. URL Userinfo Passwords
  result = redactUrlPasswords(result);

  // 3. Authorization Headers
  result = redactAuthorizationHeaders(result);

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

  // 6. YAML Multiline Block Scalars (| or >)
  result = redactYamlMultilineBlocks(result);

  // 7. Space-Separated CLI Flags (--flag val, --flag "val", --flag 'val')
  const flagRegex = /(--[A-Za-z0-9_-]+)(\s+)("((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(?!--)((?:\\.|[^\s"',;}\]\r\n&|><])+))/giu;
  result = result.replace(flagRegex, (match, flag, space, valWithQuotes, dQuoteVal, sQuoteVal, unquotedVal) => {
    if (typeof flag !== 'string' || !isSensitiveKeyToken(flag)) {
      return match;
    }
    const val = (dQuoteVal ?? sQuoteVal ?? unquotedVal ?? valWithQuotes) as string;
    if (isShellExpression(val)) {
      return match;
    }
    if (valWithQuotes.startsWith('"')) {
      return `${flag}${space}"[REDACTED]"`;
    }
    if (valWithQuotes.startsWith("'")) {
      return `${flag}${space}'[REDACTED]'`;
    }
    return `${flag}${space}[REDACTED]`;
  });

  // 8. Key-Value Assignments & YAML Colon / Equals Assignments
  const keyBoundary = '(?:^|\\s|[{,])';
  const ansiPattern = '(?:(?:\\\\u001b|\\u001b|\\x1b)\\[[0-9;]*m)*';
  const keyTokenPattern = '([A-Za-z0-9_-]+)';

  const doubleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)"((?:\\\\.|[^"\\\\])*)"`,
    'giu',
  );
  result = result.replace(doubleQuotedAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}"[REDACTED]"`;
  });

  const singleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)'((?:\\\\.|[^'\\\\])*)'`,
    'giu',
  );
  result = result.replace(singleQuotedAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}'[REDACTED]'`;
  });

  // Unterminated double/single quoted assignments
  const unterminatedQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)(["'])(?!\\\[REDACTED\\\])([^"'\r\n]+)$`,
    'gimu',
  );
  result = result.replace(unterminatedQuotedAssignment, (match, prefix, key, quote, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}${quote}[REDACTED]${quote}`;
  });

  // YAML / Colon unquoted assignments: key: val (exclude flow mapping punctuation , and {})
  const yamlColonAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*:\\s*)(?!["'\\s]|\\\[REDACTED\\\](?:$|\\s|["',;}\\]&|><]))${shellExprLookahead}([^"\\s'\\r\\n,{}]+(?:[ \\t]+[^"\\s'\\r\\n#,{}]+)*)([ \\t]+#.*)?$`,
    'gimu',
  );
  result = result.replace(yamlColonAssignment, (match, prefix, key, val, comment = '') => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    const cleanVal = typeof val === 'string' ? val.split(/(?=[&|;><])/)[0]?.trimEnd() ?? '' : '';
    const shellOpRemainder = typeof val === 'string' ? val.slice(cleanVal.length) : '';
    return `${prefix}[REDACTED]${shellOpRemainder}${comment ? comment.trimEnd() : ''}`;
  });

  // Standard unquoted assignments (key=val), handling commas in shell words vs flow mappings `{...}`
  const valToken = '((?:\\\\.|[^\\s"\'\`' + ';}\\r\\n&|><])+)';
  const unquotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)${shellExprLookahead}${valToken}`,
    'giu',
  );
  result = result.replace(unquotedAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;

    if (typeof val === 'string' && val.startsWith('[REDACTED]') && val !== '[REDACTED]') {
      return `${prefix}[REDACTED]`;
    }
    if (val === '[REDACTED]') {
      return match;
    }

    const idxMatch = result.indexOf(match);
    const lineBefore = idxMatch >= 0 ? result.slice(0, idxMatch) : '';
    const isFlowMapping = lineBefore.lastIndexOf('{') > lineBefore.lastIndexOf('}');
    if (isFlowMapping && typeof val === 'string') {
      const cleanVal = val.split(/[,}]/)[0] ?? '';
      const commaRemainder = val.slice(cleanVal.length);
      return `${prefix}[REDACTED]${commaRemainder}`;
    }

    return `${prefix}[REDACTED]`;
  });

  return result;
}

export function truncateText(text: string, maxLength?: number | undefined): string {
  if (maxLength === undefined || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n${TRUNCATION_MARKER}`;
}

export function redactAndTruncate(text: string, options: { redact?: boolean; maxLength?: number | undefined }): string {
  const doRedact = options.redact ?? false;
  const maxLen = options.maxLength;

  if (!doRedact) {
    return truncateText(text, maxLen);
  }

  const isOriginalOverMax = maxLen !== undefined && text.length > maxLen;

  // Bound scanning region to avoid quadratic work on large inputs
  const scanLimit = maxLen !== undefined ? maxLen + 2000 : text.length;
  let scanRegion = text.slice(0, scanLimit);

  scanRegion = redactSecrets(scanRegion);

  if (maxLen !== undefined && scanRegion.length > maxLen) {
    const beginRegex = /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----/giu;
    let match: RegExpExecArray | null;
    while ((match = beginRegex.exec(scanRegion.slice(0, maxLen))) !== null) {
      const label = match[1];
      if (typeof label !== 'string') continue;
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

  if (maxLen !== undefined) {
    if (isOriginalOverMax || scanRegion.length > maxLen) {
      return `${scanRegion.slice(0, maxLen)}\n${TRUNCATION_MARKER}`;
    }
  }

  return scanRegion;
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

  let triggerReason = `[${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`;
  if (doRedact) {
    triggerReason = redactAndTruncate(triggerReason, {
      redact: doRedact,
      maxLength: maxSummaryLen,
    });
  }

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
