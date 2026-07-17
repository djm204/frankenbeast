const REDACTED = '<redacted>';
const REDACTED_EMAIL = '<redacted-email>';

const SENSITIVE_KEY_RE = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|AUTHORIZATION|PROXY[_-]?AUTHORIZATION|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLAUDE[_-]?SESSION)(?:$|[_-])/iu;
const ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gu;
const HEADER_STYLE_FIELD_RE = /\b([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gu;
const JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gu;
const WHOLE_HEADER_STYLE_RE = /\b((?:Set-)?Cookie)\s*:\s*(.+?)(?=\s+[A-Za-z_][A-Za-z0-9_-]*\s*:|$)/giu;
const CREDENTIAL_URL_RE = /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/(?:[^:\s"'/@]+)?):[^@\s"']+(@[^\s"']+)/giu;
const SENSITIVE_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  /\b(?:sk|gho|ghp|glpat|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/gu,
  /\bnpm_[A-Za-z0-9_\-]{12,}\b/gu,
  /https:\/\/(?:discord(?:app)?\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/giu,
  /\b(?:Bearer|token)\s+[A-Za-z0-9._~+/=-]{20,}\b/giu,
];

export type RedactionDecisionSource = 'text-assignment' | 'text-json-field' | 'text-opaque-literal' | 'object-key';

export interface RedactionDecision {
  /** Secret-free location of the redaction decision. Object paths use dot/bracket notation. */
  path: string;
  /** Secret-free key that caused the redaction decision. */
  key: string;
  /** Where the redaction decision came from. */
  source: RedactionDecisionSource;
  /** Redaction rule category. Does not include the redacted value. */
  rule: 'sensitive-key';
  /** Replacement marker written in place of the sensitive value. */
  replacement: typeof REDACTED;
}

export interface RedactionResult<T> {
  value: T;
  decisions: RedactionDecision[];
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
  return SENSITIVE_KEY_RE.test(normalized);
}

export function redactSensitiveText(text: string): string {
  return redactSensitiveTextWithProvenance(text).value;
}

export function maskOpaqueSecretLiterals(text: string): string {
  return text
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/gu, REDACTED)
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/gu, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, REDACTED)
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu, REDACTED)
    .replace(/\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/[^:@/\s"']*):[^@\s"']+(@[^/\s"']*)/giu, `$1:${REDACTED}$2`)
    .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:@/\s"']+):[^@\s"']+(@[^/\s"']*)/gu, `$1:${REDACTED}$2`)
    .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/):[^@\s"']+(@[^/\s"']*)/gu, `$1:${REDACTED}$2`)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, REDACTED_EMAIL)
    .replace(/\b(?:Bearer|Basic|Bot)\s+[A-Za-z0-9._~+/=-]{8,}\b/giu, (match) => `${match.split(/\s+/u)[0]} ${REDACTED}`)
    .replace(/((?:^|[\s"'])--(?:api-?key|auth|authorization|bearer|password|secret|token)\s+)[^\s"']+/giu, `$1${REDACTED}`)
    .replace(/((?:^|[\s"'])--(?:api-?key|auth|authorization|bearer|password|secret|token)=)[^\s"']+/giu, `$1${REDACTED}`)
    .replace(/("--(?:api-?key|auth|authorization|bearer|password|secret|token)"\s*,\s*")[^"]+/giu, `$1${REDACTED}`);
}

export function redactSensitiveTextWithProvenance(text: string, path = '$'): RedactionResult<string> {
  const decisions: RedactionDecision[] = [];
  const withAssignmentsRedacted = text.replace(ASSIGNMENT_RE, (match, key: string) => {
    if (!isSensitiveLogKey(key)) {
      return match;
    }
    decisions.push(createDecision(path, key, 'text-assignment'));
    return `${key}=${REDACTED}`;
  });

  const jsonRedacted = withAssignmentsRedacted.replace(JSON_FIELD_RE, (match, prefix: string, key: string) => {
    if (!isSensitiveLogKey(key)) {
      return match;
    }
    decisions.push(createDecision(path, key, 'text-json-field'));
    return `${prefix}"${REDACTED}"`;
  });

  const withWholeHeadersRedacted = jsonRedacted.replace(WHOLE_HEADER_STYLE_RE, (_match, key: string) => {
    decisions.push(createDecision(path, key, 'text-assignment'));
    return `${key}: ${REDACTED}`;
  });

  const withAuthorizationSchemesRedacted = withWholeHeadersRedacted.replace(/\b((?:Proxy-)?Authorization)\s*:\s*(Bearer|Basic|Bot)\s+(.+?)(?=\s+[A-Za-z_][A-Za-z0-9_-]*\s*:|$)/giu, (_match, key: string, scheme: string) => {
    decisions.push(createDecision(path, key, 'text-assignment'));
    return `${key}: ${scheme} ${REDACTED}`;
  });

  const withAuthorizationHeadersRedacted = withAuthorizationSchemesRedacted.replace(/\b((?:Proxy-)?Authorization)\s*:\s*(.+?)(?=\s+[A-Za-z_][A-Za-z0-9_-]*\s*:|$)/giu, (match, key: string, value: string) => {
    if (/^(?:Bearer|Basic|Bot)\b/iu.test(value.trimStart())) {
      return match;
    }
    decisions.push(createDecision(path, key, 'text-assignment'));
    return `${key}: ${REDACTED}`;
  });

  const headerRedacted = withAuthorizationHeadersRedacted.replace(HEADER_STYLE_FIELD_RE, (match, key: string) => {
    if (!isSensitiveLogKey(key)) {
      return match;
    }
    if (/^(?:authorization|proxy-authorization)$/iu.test(key)) {
      return match;
    }
    decisions.push(createDecision(path, key, 'text-assignment'));
    return `${key}: ${REDACTED}`;
  });

  let value = headerRedacted.replace(CREDENTIAL_URL_RE, `$1:${REDACTED}$2`);
  value = maskOpaqueSecretLiterals(value);
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    value = value.replace(pattern, () => REDACTED);
  }
  if (value !== headerRedacted) {
    decisions.push(createDecision(path, 'opaque-secret-literal', 'text-opaque-literal'));
  }

  return { value, decisions };
}

export function redactLogData(value: unknown): unknown {
  return redactLogDataWithProvenance(value).value;
}

export function redactLogDataWithProvenance<T>(value: T): RedactionResult<unknown> {
  const decisions: RedactionDecision[] = [];
  const redacted = redactValue(value, undefined, ['$'], new WeakSet<object>(), decisions);
  return { value: redacted, decisions };
}

function redactValue(
  value: unknown,
  key: string | undefined,
  path: string[],
  seen: WeakSet<object>,
  decisions: RedactionDecision[],
): unknown {
  if (key !== undefined && isSensitiveLogKey(key)) {
    decisions.push(createDecision(formatPath(path), key, 'object-key'));
    return REDACTED;
  }

  if (typeof value === 'string') {
    const result = redactSensitiveTextWithProvenance(value, formatPath(path));
    decisions.push(...result.decisions);
    return result.value;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, undefined, [...path, `[${index}]`], seen, decisions));
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    redacted[entryKey] = redactValue(entryValue, entryKey, [...path, entryKey], seen, decisions);
  }
  return redacted;
}

function createDecision(path: string, key: string, source: RedactionDecisionSource): RedactionDecision {
  return {
    path,
    key,
    source,
    rule: 'sensitive-key',
    replacement: REDACTED,
  };
}

function formatPath(path: string[]): string {
  return path.reduce((formatted, segment) => {
    if (segment.startsWith('[')) {
      return `${formatted}${segment}`;
    }
    if (formatted === '') {
      return segment;
    }
    return `${formatted}.${segment}`;
  }, '');
}
