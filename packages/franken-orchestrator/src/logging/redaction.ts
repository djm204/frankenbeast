const REDACTED = '<redacted>';

const SENSITIVE_KEY_RE = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|AUTHORIZATION|PROXY[_-]?AUTHORIZATION|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLAUDE[_-]?SESSION)(?:$|[_-])/iu;
const ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gu;
const JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gu;

export type RedactionDecisionSource = 'text-assignment' | 'text-json-field' | 'object-key';

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

export function redactSensitiveTextWithProvenance(text: string, path = '$'): RedactionResult<string> {
  const decisions: RedactionDecision[] = [];
  const withAssignmentsRedacted = text.replace(ASSIGNMENT_RE, (match, key: string) => {
    if (!isSensitiveLogKey(key)) {
      return match;
    }
    decisions.push(createDecision(path, key, 'text-assignment'));
    return `${key}=${REDACTED}`;
  });

  const value = withAssignmentsRedacted.replace(JSON_FIELD_RE, (match, prefix: string, key: string) => {
    if (!isSensitiveLogKey(key)) {
      return match;
    }
    decisions.push(createDecision(path, key, 'text-json-field'));
    return `${prefix}"${REDACTED}"`;
  });

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
