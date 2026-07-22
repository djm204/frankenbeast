import type { OTELAttribute, OTELAttributeValue, OTELPayload } from './OTELSerializer.js'

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_RE = /(?:^|_)(?:secret|token|password|passwd|pwd|credential|cookie|bearer|auth|authorization|api_?key|private_?key|access_?key)(?:$|_)/iu
const SENSITIVE_ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_-]*)(\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gu
const SENSITIVE_JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gu
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu
const COOKIE_HEADER_RE = /\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/giu
const AUTHORIZATION_ASSIGNMENT_RE = /\b((?:proxy[-_])?authorization\s*[=:]\s*)(?:Basic|Bearer)\s+[^\s,;]+/giu
const AUTHORIZATION_RE = /\b((?:Proxy-)?Authorization\s*:\s*)(?:Basic|Bearer)\s+[^\s,;]+/giu
const DISCORD_WEBHOOK_RE = /https:\/\/(?:discord(?:app)?\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/giu
const CREDENTIAL_URL_RE = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]*:[^\s@/]+@[^\s]+/giu
const BEARER_RE = /\bBearer\s+[^\s,;]+/giu
const TOKEN_RE = /\b(?:(?:sk|gh[oprsu]|glpat|glc|xox[baprs])[-_][A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9_-]{12,})\b/gu

function normalizeSensitiveKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/giu, '_')
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(normalizeSensitiveKey(key))
}

function redactText(value: string): string {
  return value
    .replace(PRIVATE_KEY_RE, REDACTED)
    .replace(COOKIE_HEADER_RE, REDACTED)
    .replace(AUTHORIZATION_ASSIGNMENT_RE, `$1${REDACTED}`)
    .replace(AUTHORIZATION_RE, `$1${REDACTED}`)
    .replace(DISCORD_WEBHOOK_RE, REDACTED)
    .replace(CREDENTIAL_URL_RE, REDACTED)
    .replace(BEARER_RE, REDACTED)
    .replace(SENSITIVE_ASSIGNMENT_RE, (match, key: string, separator: string) =>
      isSensitiveKey(key) ? `${key}${separator}${REDACTED}` : match,
    )
    .replace(SENSITIVE_JSON_FIELD_RE, (match, prefix: string, key: string) =>
      isSensitiveKey(key) ? `${prefix}"${REDACTED}"` : match,
    )
    .replace(TOKEN_RE, REDACTED)
}

function redactAttributeValue(value: OTELAttributeValue): OTELAttributeValue {
  if (value.stringValue === undefined) return { ...value }
  return { ...value, stringValue: redactText(value.stringValue) }
}

function redactAttribute(attribute: OTELAttribute): OTELAttribute {
  if (isSensitiveKey(attribute.key)) {
    return { ...attribute, value: { stringValue: REDACTED } }
  }
  return { ...attribute, value: redactAttributeValue(attribute.value) }
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
