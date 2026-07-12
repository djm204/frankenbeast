const REDACTED = '<redacted>';

const SENSITIVE_KEY_RE = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLAUDE[_-]?SESSION)(?:$|[_-])/iu;
const ENV_ASSIGNMENT_RE = /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLAUDE_SESSION)[A-Z0-9_]*)\s*=\s*([^\s,;]+)/giu;
const JSON_FIELD_RE = /("[^"]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLAUDE_SESSION)[^"]*"\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)"/giu;

export function isSensitiveLogKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
  return SENSITIVE_KEY_RE.test(normalized);
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(ENV_ASSIGNMENT_RE, (_match, key: string) => `${key}=${REDACTED}`)
    .replace(JSON_FIELD_RE, (_match, key: string) => `${key}${REDACTED}"`);
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
