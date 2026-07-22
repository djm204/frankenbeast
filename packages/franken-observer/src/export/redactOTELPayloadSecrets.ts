import type { OTELAttribute, OTELAttributeValue, OTELPayload } from './OTELSerializer.js'

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_RE = /(?:^|_)(?:secrets?|tokens?|passwords?|passphrases?|passwd|pwd|credentials?|cookies?|bearers?|auth|authorization|signatures?|api_?keys?|private_?keys?|access_?keys?|ssh_?keys?|signing_?keys?|gpg_?keys?|pats?|personal_?access_?tokens?|webhook_?urls?|claude_?sessions?)(?:$|_)/iu
const UNSEPARATED_SENSITIVE_SUFFIX_RE = /(?:password|secret|token)$/iu
const TOKEN_METRIC_KEY_RE = /(?:^|_)(?:(?:prompt|completion|total|input|output|cached|reasoning)_tokens?|tokens?)(?:$|_)/iu
const AUTH_SCHEME_VALUE = String.raw`(?:Basic|Bearer|Token|ApiKey|Digest|Negotiate|NTLM|AWS4-HMAC-SHA256)\s+[^\s,;]+`
const SENSITIVE_ASSIGNMENT_RE = new RegExp(
  String.raw`\b([A-Za-z_][A-Za-z0-9_.-]*)(\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|${AUTH_SCHEME_VALUE}|[^\s,;]+)`,
  'giu',
)
const SENSITIVE_FLAG_RE = new RegExp(
  String.raw`(^|\s)(--([A-Za-z][A-Za-z0-9_-]*))(\s+)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|${AUTH_SCHEME_VALUE}|[^\s,;]+)`,
  'giu',
)
const SENSITIVE_JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*(?=$|[\r\n])|[^,}\]\r\n]+)/gu
const SENSITIVE_SINGLE_QUOTED_FIELD_RE = /('([^'\\]*(?:\\.[^'\\]*)*)'\s*:\s*)('(?:\\.|[^'\\])*'|'(?:\\.|[^'\\])*(?=$|[\r\n])|[^,}\]\r\n]+)/gu
const ESCAPED_SENSITIVE_JSON_FIELD_RE = /(\\+"([^"\\]*(?:\\.[^"\\]*)*)\\+"\s*:\s*\\+")[^"\r\n]*?(\\+")/gu
const SENSITIVE_JSON_COLLECTION_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)(\[[^\]\r\n]*(?:\]|$)|\{[^}\r\n]*(?:\}|$))/gu
const ESCAPED_SENSITIVE_JSON_COLLECTION_FIELD_RE = /(\\+"([^"\\]*(?:\\.[^"\\]*)*)\\+"\s*:\s*)(\[[^\]\r\n]*(?:\]|$)|\{[^}\r\n]*(?:\}|$))/gu
const SENSITIVE_LINE_ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_.-]*)(\s*[=:]\s*)([^\r\n]*?)(?=\s+[A-Za-z_][A-Za-z0-9_.-]*\s*[=:]|$)/gu
const SENSITIVE_HEADER_TUPLE_RE = /(\[\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*")[^"\r\n]*("\s*\])/gu
const SENSITIVE_SINGLE_QUOTED_HEADER_TUPLE_RE = /(\[\s*'([^'\\]*(?:\\.[^'\\]*)*)'\s*,\s*')[^'\r\n]*('\s*\])/gu
const SENSITIVE_HEADER_OBJECT_RE = /("(?:key|name)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"(?:value|values)"\s*:\s*)("(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*(?=$|[\r\n])|[^,}\]\r\n]+)/giu
const SENSITIVE_QUERY_PARAMETER_RE = /([?&])([A-Za-z_][A-Za-z0-9_.-]*)(=)([^&#\s"']*)/giu
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu
const COOKIE_HEADER_RE = /\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/giu
const AUTHORIZATION_ASSIGNMENT_RE = /\b((?:proxy[-_])?authorization\s*[=:]\s*)[^\r\n]+/giu
const AUTHORIZATION_RE = /\b((?:Proxy-)?Authorization\s*:\s*)[^\r\n]+/giu
const DISCORD_WEBHOOK_RE = /https:\/\/(?:discord(?:app)?\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/giu
const SLACK_WEBHOOK_RE = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+/giu
const CREDENTIAL_URL_RE = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:/@"']*:[^\s@"']+@[^\s"'<>]+/gu
const BEARER_RE = /\bBearer\s+[^\s,;]+/giu
const TOKEN_RE = /\b(?:(?:sk|gh[oprsu]|glpat|glc|xox[baprs])[-_][A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/gu

function normalizeSensitiveKey(key: string): string {
  return key
    .replace(/api_?key/giu, '_api_key')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/giu, '_')
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key)
  return SENSITIVE_KEY_RE.test(normalized) || UNSEPARATED_SENSITIVE_SUFFIX_RE.test(normalized)
}

function isNumericTokenMetric(key: string, value: OTELAttributeValue): boolean {
  return TOKEN_METRIC_KEY_RE.test(normalizeSensitiveKey(key))
    && (value.intValue !== undefined || value.doubleValue !== undefined)
}

function isNumericTokenMetricText(key: string, value: string): boolean {
  return TOKEN_METRIC_KEY_RE.test(normalizeSensitiveKey(key))
    && /^\s*\d+(?:\.\d+)?\s*$/u.test(value)
}

function redactEmbeddedJson(value: string): string {
  const firstStart = value.search(/[\[{]/u)
  if (firstStart < 0) return value

  const stack: Array<{ opening: string, start: number }> = []
  const candidates: Array<{ start: number, end: number, redacted: string }> = []
  let quoted = false
  let escaped = false

  for (let index = firstStart; index < value.length; index += 1) {
    const character = value[index]!
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"' && value[index - 1] !== '\\') {
      quoted = true
    } else if (character === '{' || character === '[') {
      stack.push({ opening: character, start: index })
    } else if (character === '}' || character === ']') {
      const frame = stack.at(-1)
      if (frame === undefined
        || (frame.opening === '{' && character !== '}')
        || (frame.opening === '[' && character !== ']')) {
        stack.length = 0
        continue
      }
      stack.pop()
      const candidate = value.slice(frame.start, index + 1)
      let redacted: string | undefined
      try {
        redacted = JSON.stringify(redactJsonValue(JSON.parse(candidate)))
      } catch {
        const unescaped = candidate.replace(/\\+"/gu, '"')
        if (unescaped !== candidate) {
          try {
            redacted = JSON.stringify(redactJsonValue(JSON.parse(unescaped))).replace(/"/gu, '\\"')
          } catch {
            // Keep scanning for a later valid embedded candidate.
          }
        }
      }
      if (redacted !== undefined) {
        for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
          if (candidates[candidateIndex]!.start >= frame.start) candidates.splice(candidateIndex, 1)
        }
        candidates.push({ start: frame.start, end: index + 1, redacted })
      }
    }
  }

  if (candidates.length === 0) return value
  candidates.sort((left, right) => left.start - right.start)
  let output = ''
  let cursor = 0
  for (const candidate of candidates) {
    output += value.slice(cursor, candidate.start) + candidate.redacted
    cursor = candidate.end
  }
  return output + value.slice(cursor)
}

function redactPlainText(value: string): string {
  return redactEmbeddedJson(value)
    .replace(PRIVATE_KEY_RE, REDACTED)
    .replace(COOKIE_HEADER_RE, REDACTED)
    .replace(SENSITIVE_QUERY_PARAMETER_RE, (match, leading: string, key: string, separator: string) =>
      isSensitiveKey(key) ? `${leading}${key}${separator}${REDACTED}` : match,
    )
    .replace(SENSITIVE_LINE_ASSIGNMENT_RE, (match, key: string, separator: string, child: string) =>
      isSensitiveKey(key) && !isNumericTokenMetricText(key, child)
        ? `${key}${separator}${REDACTED}`
        : match,
    )
    .replace(SENSITIVE_HEADER_TUPLE_RE, (match, prefix: string, key: string, suffix: string) =>
      isSensitiveKey(key) ? `${prefix}${REDACTED}${suffix}` : match,
    )
    .replace(SENSITIVE_SINGLE_QUOTED_HEADER_TUPLE_RE, (match, prefix: string, key: string, suffix: string) =>
      isSensitiveKey(key) ? `${prefix}${REDACTED}${suffix}` : match,
    )
    .replace(SENSITIVE_HEADER_OBJECT_RE, (match, prefix: string, key: string) =>
      isSensitiveKey(key) ? `${prefix}"${REDACTED}"` : match,
    )
    .replace(SENSITIVE_JSON_COLLECTION_FIELD_RE, (match, prefix: string, key: string) =>
      isSensitiveKey(key) ? `${prefix}"${REDACTED}"` : match,
    )
    .replace(ESCAPED_SENSITIVE_JSON_COLLECTION_FIELD_RE, (match, prefix: string, key: string) =>
      isSensitiveKey(key) ? `${prefix}"${REDACTED}"` : match,
    )
    .replace(AUTHORIZATION_ASSIGNMENT_RE, `$1${REDACTED}`)
    .replace(AUTHORIZATION_RE, `$1${REDACTED}`)
    .replace(DISCORD_WEBHOOK_RE, REDACTED)
    .replace(SLACK_WEBHOOK_RE, REDACTED)
    .replace(CREDENTIAL_URL_RE, REDACTED)
    .replace(BEARER_RE, REDACTED)
    .replace(SENSITIVE_FLAG_RE, (match, leading: string, flag: string, key: string, separator: string) =>
      isSensitiveKey(key) ? `${leading}${flag}${separator}${REDACTED}` : match,
    )
    .replace(SENSITIVE_ASSIGNMENT_RE, (match, key: string, separator: string, child: string) =>
      isSensitiveKey(key) && !isNumericTokenMetricText(key, child)
        ? `${key}${separator}${REDACTED}`
        : match,
    )
    .replace(SENSITIVE_JSON_FIELD_RE, (match, prefix: string, key: string, child: string) =>
      isSensitiveKey(key) && !isNumericTokenMetricText(key, child)
        ? `${prefix}"${REDACTED}"`
        : match,
    )
    .replace(SENSITIVE_SINGLE_QUOTED_FIELD_RE, (match, prefix: string, key: string, child: string) =>
      isSensitiveKey(key) && !isNumericTokenMetricText(key, child)
        ? `${prefix}'${REDACTED}'`
        : match,
    )
    .replace(ESCAPED_SENSITIVE_JSON_FIELD_RE, (match, prefix: string, key: string, suffix: string) =>
      isSensitiveKey(key) ? `${prefix}${REDACTED}${suffix}` : match,
    )
    .replace(TOKEN_RE, REDACTED)
}

function redactJsonValue(value: unknown): unknown {
  if (typeof value === 'string') return redactPlainText(value)
  if (Array.isArray(value)) {
    if (value.length >= 2 && typeof value[0] === 'string' && isSensitiveKey(value[0])) {
      return [redactPlainText(value[0]), REDACTED, ...value.slice(2).map(redactJsonValue)]
    }
    return value.map(redactJsonValue)
  }
  if (value === null || typeof value !== 'object') return value

  const entries = Object.entries(value)
  const headerName = entries.find(([key, child]) =>
    (key.toLowerCase() === 'key' || key.toLowerCase() === 'name')
      && typeof child === 'string' && isSensitiveKey(child),
  )
  return Object.fromEntries(entries.map(([key, child]) => [
    redactPlainText(key),
    (isSensitiveKey(key) && !(TOKEN_METRIC_KEY_RE.test(normalizeSensitiveKey(key)) && typeof child === 'number'))
      || (headerName !== undefined && (key.toLowerCase() === 'value' || key.toLowerCase() === 'values'))
      ? REDACTED
      : redactJsonValue(child),
  ]))
}

function redactText(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.stringify(redactJsonValue(JSON.parse(value)))
    } catch {
      // Fall through to best-effort text redaction for malformed JSON.
    }
  }
  return redactPlainText(value)
}

function redactAttributeValue(value: OTELAttributeValue): OTELAttributeValue {
  if (value.stringValue === undefined) return { ...value }
  return { ...value, stringValue: redactText(value.stringValue) }
}

function redactAttribute(attribute: OTELAttribute): OTELAttribute {
  const key = redactPlainText(attribute.key)
  if (isSensitiveKey(attribute.key) && !isNumericTokenMetric(attribute.key, attribute.value)) {
    return { ...attribute, key, value: { stringValue: REDACTED } }
  }
  return { ...attribute, key, value: redactAttributeValue(attribute.value) }
}

/**
 * Clone an OTEL export payload while masking credential-bearing attributes and
 * secret-shaped text. This protects external observability egress without
 * modifying the caller's trace or the HTTP Authorization header used to send it.
 */
export function redactOTELPayloadSecrets(payload: OTELPayload): OTELPayload {
  return {
    resourceSpans: payload.resourceSpans.map(resourceSpan => ({
      resource: {
        attributes: resourceSpan.resource.attributes.map(redactAttribute),
      },
      scopeSpans: resourceSpan.scopeSpans.map(scopeSpans => ({
        scope: { ...scopeSpans.scope },
        spans: scopeSpans.spans.map(span => ({
          ...span,
          name: redactText(span.name),
          attributes: span.attributes.map(redactAttribute),
          status: {
            ...span.status,
            ...(span.status.message === undefined ? {} : { message: redactText(span.status.message) }),
          },
        })),
      })),
    })),
  }
}
