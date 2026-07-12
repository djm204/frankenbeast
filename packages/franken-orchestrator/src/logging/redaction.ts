const REDACTED = '<redacted>';

const SENSITIVE_KEY_RE = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|AUTHORIZATION|PROXY[_-]?AUTHORIZATION|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLAUDE[_-]?SESSION)(?:$|[_-])/iu;
const ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gu;
const JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gu;

export function isSensitiveLogKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
  return SENSITIVE_KEY_RE.test(normalized);
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(ASSIGNMENT_RE, (match, key: string) => isSensitiveLogKey(key) ? `${key}=${REDACTED}` : match)
    .replace(JSON_FIELD_RE, (match, prefix: string, key: string) => isSensitiveLogKey(key) ? `${prefix}"${REDACTED}"` : match);
}

export function redactLogData(value: unknown): unknown {
  return redactValue(value, undefined, new WeakSet<object>());
}

function redactValue(value: unknown, key: string | undefined, seen: WeakSet<object>): unknown {
  if (key !== undefined && isSensitiveLogKey(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, undefined, seen));
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    redacted[entryKey] = redactValue(entryValue, entryKey, seen);
  }
  return redacted;
}
