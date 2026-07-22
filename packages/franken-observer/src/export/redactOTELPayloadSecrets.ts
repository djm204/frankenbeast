import type { OTELAttribute, OTELAttributeValue, OTELPayload } from './OTELSerializer.js'

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_RE = /(?:^|_)(?:secrets?|tokens?|passwords?|passwd|pwd|credentials?|cookies?|bearers?|auth|authorization|api_?keys?|private_?keys?|access_?keys?)(?:$|_)/iu
const AUTH_SCHEME_VALUE = String.raw`(?:Basic|Bearer|Token)\s+[^\s,;]+`
const SENSITIVE_ASSIGNMENT_RE = new RegExp(
  String.raw`\b([A-Za-z_][A-Za-z0-9_-]*)(\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|${AUTH_SCHEME_VALUE}|[^\s,;]+)`,
  'giu',
)
const SENSITIVE_FLAG_RE = new RegExp(
  String.raw`(^|\s)(--([A-Za-z][A-Za-z0-9_-]*))(\s+)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|${AUTH_SCHEME_VALUE}|[^\s,;]+)`,
  'giu',
)
const SENSITIVE_JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|"(?:\\.|[^"\\])*(?=$|[\r\n])|[^,}\]\r\n]+)/gu
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
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/giu, '_')
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(normalizeSensitiveKey(key))
}

function redactEmbeddedJson(value: string): string {
  let output = ''
  let cursor = 0

  while (cursor < value.length) {
    const start = value.slice(cursor).search(/[\[{]/u)
    if (start < 0) return output + value.slice(cursor)

    const absoluteStart = cursor + start
    output += value.slice(cursor, absoluteStart)
    const stack: string[] = []
    let quoted = false
    let escaped = false
    let end = absoluteStart

    for (; end < value.length; end += 1) {
      const character = value[end]!
      if (quoted) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') quoted = false
        continue
      }
      if (character === '"') {
        quoted = true
      } else if (character === '{' || character === '[') {
        stack.push(character)
      } else if (character === '}' || character === ']') {
        const opening = stack.at(-1)
        if ((opening === '{' && character !== '}') || (opening === '[' && character !== ']')) break
        stack.pop()
        if (stack.length === 0) {
          end += 1
          break
        }
      }
    }

    if (stack.length > 0 || quoted) {
      // No balanced JSON candidate starts here. Preserve the remaining text for
      // the linear regex passes below instead of rescanning every later opener.
      return output + value.slice(absoluteStart)
    }

    const candidate = value.slice(absoluteStart, end)
    try {
      output += JSON.stringify(redactJsonValue(JSON.parse(candidate)))
      cursor = end
    } catch {
      output += value[absoluteStart]
      cursor = absoluteStart + 1
    }
  }

  return output
}

function redactPlainText(value: string): string {
  return redactEmbeddedJson(value)
    .replace(PRIVATE_KEY_RE, REDACTED)
    .replace(COOKIE_HEADER_RE, REDACTED)
    .replace(AUTHORIZATION_ASSIGNMENT_RE, `$1${REDACTED}`)
    .replace(AUTHORIZATION_RE, `$1${REDACTED}`)
    .replace(DISCORD_WEBHOOK_RE, REDACTED)
    .replace(SLACK_WEBHOOK_RE, REDACTED)
    .replace(CREDENTIAL_URL_RE, REDACTED)
    .replace(BEARER_RE, REDACTED)
    .replace(SENSITIVE_FLAG_RE, (match, leading: string, flag: string, key: string, separator: string) =>
      isSensitiveKey(key) ? `${leading}${flag}${separator}${REDACTED}` : match,
    )
    .replace(SENSITIVE_ASSIGNMENT_RE, (match, key: string, separator: string) =>
      isSensitiveKey(key) ? `${key}${separator}${REDACTED}` : match,
    )
    .replace(SENSITIVE_JSON_FIELD_RE, (match, prefix: string, key: string) =>
      isSensitiveKey(key) ? `${prefix}"${REDACTED}"` : match,
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

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    redactPlainText(key),
    isSensitiveKey(key) ? REDACTED : redactJsonValue(child),
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
  if (isSensitiveKey(attribute.key)) {
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
