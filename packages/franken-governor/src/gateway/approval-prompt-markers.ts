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
  'passphrase',
  'passphrases',
  'credential',
  'credentials',
];

export function isSensitiveKeyToken(token: string): boolean {
  const clean = token
    .replace(/^\\u001b\[[0-9;]*m/g, '')
    .replace(/^\x1b\[[0-9;]*m/g, '')
    .replace(/\\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/^--/, '')
    .replace(/^\$/, '')
    .replace(/^["']/, '')
    .replace(/["']$/, '');

  // Normalize camelCase boundaries before lowercasing (e.g., clientSecret -> client_secret)
  const withSeparators = clean.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  const lower = withSeparators.toLowerCase();

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
  // Detect executable shell expansions anywhere in value (not just start)
  return /\$\(|\`|\$\{|<\(|>\(/.test(val);
}

export function isPlausibleArmoredKeyBody(body: string): boolean {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return true;

  let plausibleLineCount = 0;

  for (const line of lines) {
    if (/^(?:Version|Comment|Proc-Type|DEK-Info|Hash):\s+/i.test(line)) {
      plausibleLineCount++;
      continue;
    }
    if (/^=[A-Za-z0-9+/]{4}$/.test(line)) {
      plausibleLineCount++;
      continue;
    }
    if (line === '...' || line === '…') {
      plausibleLineCount++;
      continue;
    }

    // Reject short command words like shutdown, reboot, rm, cat
    if (/^[a-z_]{1,15}$/i.test(line)) {
      return false;
    }

    if (/^[A-Za-z0-9+/=]{12,}(?:\.{3}|…)?$/.test(line)) {
      plausibleLineCount++;
      continue;
    }

    return false;
  }

  return plausibleLineCount > 0;
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

function redactUrlPasswords(text: string, isTruncatedTail = false): string {
  if (isTruncatedTail) {
    return text.replace(
      /\b([a-z0-9+.-]+:\/\/(?:[a-zA-Z0-9_%+.-]+:))([^@/\s]+)(?:(@[a-zA-Z0-9.\[\]:-]+)|(?=$))/giu,
      (match, prefix, _pass, atHost) => {
        return `${prefix}[REDACTED]${atHost ?? ''}`;
      },
    );
  }

  return text.replace(
    /\b([a-z0-9+.-]+:\/\/(?:[a-zA-Z0-9_%+.-]+:))([^@/\s]+)(@[a-zA-Z0-9.\[\]:-]+)/giu,
    '$1[REDACTED]$3',
  );
}

function redactAuthorizationHeaders(text: string): string {
  let result = text;

  // Single quoted POSIX shell header argument: stops at first single quote (no escapes in POSIX single quotes)
  result = result.replace(
    /('(?:Authorization|Cookie|Set-Cookie|Proxy-Authorization)\s*:\s*[^']*')/giu,
    (match) => {
      const colonIdx = match.indexOf(':');
      const headerName = match.slice(1, colonIdx).trim();
      return `'${headerName}: [REDACTED]'`;
    },
  );

  // Double quoted shell header argument with escaped quotes support
  result = result.replace(
    /(")(Authorization|Cookie|Set-Cookie|Proxy-Authorization)\s*:\s*(?:(?:\\.|[^"\\])+)\1/giu,
    '$1$2: [REDACTED]$1',
  );

  // Standalone header lines
  result = result.replace(
    /(^|\n|\r)(\s*(?:Authorization|Cookie|Set-Cookie|Proxy-Authorization)\s*:\s*)[^\r\n]+/giu,
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
      if (line.trim().length === 0) {
        out.push(line);
        continue;
      }
      const matchIndent = line.match(/^(\s*)/);
      const currentIndent = (matchIndent && matchIndent[1]) ? matchIndent[1].length : 0;
      if (currentIndent > blockIndent) {
        continue;
      } else {
        inRedactedBlock = false;
      }
    }

    const yamlBlockMatch = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*[|>](?:[-+]?\d?|\d?[-+]?)\s*$/);
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

export function redactSecrets(text: string, options?: { isTruncatedTail?: boolean }): string {
  const isTruncatedTail = options?.isTruncatedTail ?? false;
  let result = text;

  // 1. Private Key Blocks (plausible key body check)
  result = redactPrivateKeyBlocks(result);

  // 2. URL Userinfo Passwords (supports dots and plus in username, IPv6 authority, cutoff boundary)
  result = redactUrlPasswords(result, isTruncatedTail);

  // 3. Authorization, Cookie, Set-Cookie, Proxy-Authorization Headers
  result = redactAuthorizationHeaders(result);

  // 4. Standalone Bearer tokens outside Authorization header (including short/single-char tokens)
  result = result.replace(
    /\b(Bearer\s+)[A-Za-z0-9_.~+/\-]+/giu,
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

  // 6. YAML Multiline Block Scalars (| or > with indicators like |2, |2-, >+2)
  result = redactYamlMultilineBlocks(result);

  // 7. Space-Separated CLI Flags (--flag val, --flag "val", --flag 'val', unterminated, shell expr)
  const flagRegex = /(--[A-Za-z0-9_-]+)(\s+)("((?:\\.|[^"\r\n\\])*)"|'((?:\\.|[^'\r\n\\])*)'|"([^"\r\n]+)$|'([^'\r\n]+)$|(?!--)((?:\\.|[^\s"'\r\n&|><;]|<\([^)]*\)|>\([^)]*\))+))/gimu;
  result = result.replace(flagRegex, (match, flag, space, valWithQuotes, dQuoteVal, sQuoteVal, dQuoteUnterm, sQuoteUnterm, unquotedVal) => {
    if (typeof flag !== 'string' || !isSensitiveKeyToken(flag)) {
      return match;
    }
    const val = (dQuoteVal ?? sQuoteVal ?? dQuoteUnterm ?? sQuoteUnterm ?? unquotedVal ?? valWithQuotes) as string;
    const isSingleQuoted = valWithQuotes.startsWith("'") || sQuoteUnterm !== undefined;
    if (!isSingleQuoted && isShellExpression(val)) {
      return match;
    }
    if (valWithQuotes.startsWith('"') || dQuoteUnterm !== undefined) {
      return `${flag}${space}"[REDACTED]"`;
    }
    if (valWithQuotes.startsWith("'") || sQuoteUnterm !== undefined) {
      return `${flag}${space}'[REDACTED]'`;
    }
    return `${flag}${space}[REDACTED]`;
  });

  // 8. Key-Value Assignments & YAML Colon / Equals Assignments
  // Treat shell operators (; && || | &), parenthesis, and flow punctuation as key boundaries
  const keyBoundary = '(?:^|\\s|[{,;(]|&&|\\|\\||[&|])';
  const ansiPattern = '(?:(?:\\\\u001b|\\u001b|\\x1b)\\[[0-9;]*m)*';
  const keyTokenPattern = '([A-Za-z0-9_-]+)';

  // Quoted JSON properties: "key": "val" or unquoted key="val"
  const doubleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?${ansiPattern}\\s*[:=]\\s*)"((?:\\\\.|[^"\\r\\n\\\\])*)"`,
    'giu',
  );
  result = result.replace(doubleQuotedAssignment, (match, prefix, key, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}"[REDACTED]"`;
  });

  const singleQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}'?${keyTokenPattern}'?\\s*[:=]\\s*)'((?:\\\\.|[^'\\r\\n\\\\])*)'`,
    'giu',
  );
  result = result.replace(singleQuotedAssignment, (match, prefix, key) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    return `${prefix}'[REDACTED]'`;
  });

  // Unterminated double/single quoted assignments (opposite quotes are ordinary data)
  const unterminatedQuotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}"?${keyTokenPattern}"?\\s*[:=]\\s*)(["'])(?!\\\[REDACTED\\\])([^\\r\\n]+)$`,
    'gimu',
  );
  result = result.replace(unterminatedQuotedAssignment, (match, prefix, key, quote, val) => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    const isSingleQuoted = quote === "'";
    if (!isSingleQuoted && typeof val === 'string' && isShellExpression(val)) return match;
    return `${prefix}${quote}[REDACTED]${quote}`;
  });

  // YAML / Colon unquoted assignments: key: val
  const yamlColonAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*:\\s*)(?!["'\\s]|\\\[REDACTED\\\](?:$|\\s|["',;}\\]&|><]))([^"\\s'\\r\\n,{}]+(?:[ \\t]+[^"\\s'\\r\\n#,{}]+)*)([ \\t]+#.*)?$`,
    'gimu',
  );
  result = result.replace(yamlColonAssignment, (match, prefix, key, val, comment = '') => {
    if (typeof key !== 'string' || !isSensitiveKeyToken(key)) return match;
    if (typeof val === 'string' && isShellExpression(val)) return match;
    const cleanVal = typeof val === 'string' ? val.split(/(?=[&|;><])/)[0]?.trimEnd() ?? '' : '';
    const shellOpRemainder = typeof val === 'string' ? val.slice(cleanVal.length) : '';
    return `${prefix}[REDACTED]${shellOpRemainder}${comment ? comment.trimEnd() : ''}`;
  });

  // Standard unquoted assignments (key=val)
  const valToken = '((?:\\\\.|[^\\s"\';}\\r\\n&|><]|<\\([^)]*\\)|>\\([^)]*\\))+)';
  const unquotedAssignment = new RegExp(
    `(${keyBoundary}${ansiPattern}${keyTokenPattern}${ansiPattern}\\s*[:=]\\s*)${valToken}`,
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

    if (typeof val === 'string') {
      const cleanVal = val.replace(/[}\]]+$/, '');
      const bracketRemainder = val.slice(cleanVal.length);
      return `${prefix}[REDACTED]${bracketRemainder}`;
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
  const isScanTruncated = text.length > scanLimit;
  let scanRegion = text.slice(0, scanLimit);

  scanRegion = redactSecrets(scanRegion, { isTruncatedTail: isScanTruncated });

  // Inspect the displayed scanRegion (or slice up to maxLen) for private key BEGIN markers
  const effectiveMax = maxLen !== undefined ? maxLen : scanRegion.length;
  const beginRegex = /-----BEGIN ([^\r\n]*PRIVATE KEY[^\r\n]*)-----/giu;
  let match: RegExpExecArray | null;

  while ((match = beginRegex.exec(scanRegion.slice(0, effectiveMax))) !== null) {
    const label = match[1];
    if (typeof label !== 'string') continue;
    const idx = match.index;
    const endMarker = `-----END ${label}-----`.toLowerCase();
    const remainderFromIdx = scanRegion.slice(idx);
    const remainderLower = remainderFromIdx.toLowerCase();

    const hasMatchingEndInScan = remainderLower.includes(endMarker);
    const hasMismatchedEndInScan = /-----END [^\r\n]*PRIVATE KEY[^\r\n]*-----/iu.test(remainderFromIdx);

    if (!hasMatchingEndInScan && !hasMismatchedEndInScan) {
      const redactedPrefix = scanRegion.slice(0, idx) + '[REDACTED]';
      return isOriginalOverMax || (maxLen !== undefined && redactedPrefix.length > maxLen)
        ? `${redactedPrefix}\n${TRUNCATION_MARKER}`
        : redactedPrefix;
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
