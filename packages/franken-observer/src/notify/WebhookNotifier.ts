import { isIP } from 'node:net'

import { seededRandom } from '@franken/types'

import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

export interface WebhookRetryOptions {
  /** Maximum number of retry attempts after the initial try. Default: 0 (no retry). */
  maxRetries: number
  /** Base delay in milliseconds before the first retry. Default: 200. */
  baseDelayMs?: number
  /** Maximum delay cap in milliseconds. Default: 30000. */
  maxDelayMs?: number
  /**
   * Add a random jitter of up to `baseDelayMs` to each delay to avoid
   * thundering-herd on shared endpoints. Default: true.
   */
  jitter?: boolean
}

export interface WebhookAllowedTarget {
  /** Trusted webhook origin, for example `https://discord.com`. */
  origin: string
  /** Optional URL path prefix that the configured webhook URL must start with. */
  pathnamePrefix?: string
}

export interface WebhookNotifierOptions {
  /** URL to POST the JSON payload to. */
  url: string
  /**
   * Explicit allowlist of webhook target origins. Defaults to deny-by-default:
   * callers must either include the configured URL's origin here or set
   * `allowUnlistedTarget: true` for a deliberate legacy/unsafe opt-out.
   */
  allowedTargetOrigins?: readonly string[]
  /**
   * Explicit allowlist of webhook targets. String entries may include an
   * optional pathname prefix; object entries separate the origin and prefix.
   * Prefer this over `allowedTargetOrigins` when only a specific provider path
   * such as `/api/webhooks/` should receive payloads.
   */
  allowedTargets?: readonly (string | WebhookAllowedTarget)[]
  /**
   * Explicit unsafe opt-out for legacy deployments that cannot provide an
   * allowlist yet. Prefer `allowedTargetOrigins` for normal operation.
   */
  allowUnlistedTarget?: boolean
  /**
   * Additional HTTP headers merged on every request.
   * Content-Type is set to application/json by default and can be
   * overridden here.
   */
  headers?: Record<string, string>
  /** Injectable for testing. Defaults to globalThis.fetch. */
  fetch?: FetchFn
  /** Retry configuration. Omit to send exactly once (backwards-compatible). */
  retry?: WebhookRetryOptions
  /**
   * Injectable sleep function for testing retry delays without real timers.
   * Defaults to a Promise-based `setTimeout` wrapper.
   */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Delivers HITL signals (CircuitBreaker, LoopDetector) to external systems
 * over HTTP. Any JSON-serialisable payload can be sent.
 *
 * send() throws on non-2xx responses and network errors. For fire-and-forget
 * use inside event handlers, suppress the rejection with `void`:
 *
 * ```ts
 * circuitBreaker.on('limit-reached', result => {
 *   void notifier.send({ type: 'circuit-breaker', ...result })
 *     .catch(err => console.error('webhook failed', err))
 * })
 * ```
 *
 * Configure retry with exponential backoff:
 *
 * ```ts
 * const notifier = new WebhookNotifier({
 *   url: 'https://hooks.example.com/signal',
 *   allowedTargetOrigins: ['https://hooks.example.com'],
 *   retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 5000 },
 * })
 * ```
 */
function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function validateNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer`)
  }
  return value
}

function validateFiniteNonNegativeNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a finite non-negative number`)
  }
  return value
}

interface NormalizedWebhookTarget {
  origin: string
  pathnamePrefix?: string
}

function parseAbsoluteUrl(value: string, fieldName: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new TypeError(`${fieldName} must be an absolute URL`)
  }
}

function validateHttpsUrl(url: URL, fieldName: string): void {
  if (url.protocol !== 'https:') {
    throw new TypeError(`${fieldName} must use https:`)
  }
}

function validatePublicWebhookHost(url: URL, fieldName: string): void {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/g, '').toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new TypeError(`${fieldName} host ${hostname} is not allowed`)
  }

  const ipVersion = isIP(hostname)
  if (ipVersion === 4) {
    const [firstOctet = 0, secondOctet = 0] = hostname.split('.').map(part => Number(part))
    const isPrivateOrLocal =
      firstOctet === 0 ||
      firstOctet === 10 ||
      firstOctet === 127 ||
      (firstOctet === 169 && secondOctet === 254) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
      (firstOctet === 192 && secondOctet === 168)
    if (isPrivateOrLocal) {
      throw new TypeError(`${fieldName} host ${hostname} is not allowed`)
    }
  }

  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase()
    const firstHextet = Number.parseInt(normalized.split(':', 1)[0] || '0', 16)
    const isLoopback = normalized === '::1'
    const isUniqueLocal = firstHextet >= 0xfc00 && firstHextet <= 0xfdff
    const isLinkLocal = firstHextet >= 0xfe80 && firstHextet <= 0xfebf
    const isIpv4Mapped = normalized.includes('::ffff:')
    if (isLoopback || isUniqueLocal || isLinkLocal || isIpv4Mapped) {
      throw new TypeError(`${fieldName} host ${hostname} is not allowed`)
    }
  }
}

function parseUrlOrigin(value: string, fieldName: string): string {
  const url = parseAbsoluteUrl(value, fieldName)
  validateHttpsUrl(url, fieldName)
  validatePublicWebhookHost(url, fieldName)
  return url.origin
}

function normalizeAllowedTargetOrigins(origins: readonly string[] | undefined): ReadonlySet<string> | null {
  if (!origins || origins.length === 0) {
    return null
  }

  return new Set(origins.map(origin => parseUrlOrigin(origin, 'allowedTargetOrigins entry')))
}

function normalizePathnamePrefix(pathnamePrefix: string | undefined, fieldName: string): string | undefined {
  if (pathnamePrefix === undefined || pathnamePrefix === '' || pathnamePrefix === '/') {
    return undefined
  }
  if (!pathnamePrefix.startsWith('/')) {
    throw new TypeError(`${fieldName} must start with /`)
  }
  return pathnamePrefix
}

function assertOriginOnly(url: URL, fieldName: string): void {
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new TypeError(`${fieldName} must not include a path, query, or fragment; use pathnamePrefix for path scoping`)
  }
}

function pathMatchesPrefix(pathname: string, pathnamePrefix: string | undefined): boolean {
  if (!pathnamePrefix) {
    return true
  }
  if (pathname === pathnamePrefix) {
    return true
  }
  const boundaryPrefix = pathnamePrefix.endsWith('/') ? pathnamePrefix : `${pathnamePrefix}/`
  return pathname.startsWith(boundaryPrefix)
}

function normalizeAllowedTargets(
  targets: readonly (string | WebhookAllowedTarget)[] | undefined,
): readonly NormalizedWebhookTarget[] {
  if (!targets || targets.length === 0) {
    return []
  }

  return targets.map((target, index) => {
    if (typeof target === 'string') {
      const url = parseAbsoluteUrl(target, `allowedTargets[${index}]`)
      validateHttpsUrl(url, `allowedTargets[${index}]`)
      validatePublicWebhookHost(url, `allowedTargets[${index}]`)
      return {
        origin: url.origin,
        pathnamePrefix: normalizePathnamePrefix(url.pathname, `allowedTargets[${index}].pathnamePrefix`),
      }
    }

    const url = parseAbsoluteUrl(target.origin, `allowedTargets[${index}].origin`)
    validateHttpsUrl(url, `allowedTargets[${index}].origin`)
    validatePublicWebhookHost(url, `allowedTargets[${index}].origin`)
    assertOriginOnly(url, `allowedTargets[${index}].origin`)
    return {
      origin: url.origin,
      pathnamePrefix: normalizePathnamePrefix(target.pathnamePrefix, `allowedTargets[${index}].pathnamePrefix`),
    }
  })
}

const MAX_ERROR_BODY_CHARS = 2048
const ERROR_BODY_READ_TIMEOUT_MS = 250

function redactWebhookSecrets(value: string): string {
  return value
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]]*\]/gi, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]\r\n,;<>}]*$/gim, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"\r\n,;<>}]*$/gim, '$1"[REDACTED]"')
    .replace(/\bAuthorization:\s*Bearer \*\*\*(?:\s+X-Api-Key=[^\r\n,;<>}]+)?/gi, 'Authorization: ***')
    .replace(/(^|[\s;{])((?:authorization|x-api-key|api-key|x-auth-token)\s*[:=]\s*)(?!\s*\*\*\*)[^\r\n,;<>}]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\\\/\\\/[^\s"'<>]+/g, match => sanitizeWebhookEndpoint(match.replace(/\\\//g, '/')))
    .replace(/https?:\/\/[^\s"'<>]+/g, match => sanitizeWebhookEndpoint(match))
}

function sanitizeWebhookEndpoint(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''

    if (url.hostname === 'hooks.slack.com') {
      url.pathname = '/services/[REDACTED]'
    } else {
      url.pathname = url.pathname
        .split('/')
        .map((segment, index) => (segment && !(index === 1 && segment === 'services') ? '[REDACTED]' : segment))
        .join('/')
    }

    return url.toString()
  } catch {
    return '[REDACTED]'
  }
}

export class WebhookNotifier {
  private readonly url: string
  private readonly parsedUrl: URL
  private readonly targetOrigin: string
  private readonly allowedTargetOrigins: ReadonlySet<string> | null
  private readonly allowedTargets: readonly NormalizedWebhookTarget[]
  private readonly allowUnlistedTarget: boolean
  private readonly extraHeaders: Record<string, string>
  private readonly fetchFn: FetchFn
  private readonly retry: Required<WebhookRetryOptions> | null
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(options: WebhookNotifierOptions) {
    this.url = options.url
    this.parsedUrl = parseAbsoluteUrl(options.url, 'url')
    validateHttpsUrl(this.parsedUrl, 'url')
    validatePublicWebhookHost(this.parsedUrl, 'url')
    this.targetOrigin = this.parsedUrl.origin
    this.allowedTargetOrigins = normalizeAllowedTargetOrigins(options.allowedTargetOrigins)
    this.allowedTargets = normalizeAllowedTargets(options.allowedTargets)
    this.allowUnlistedTarget = options.allowUnlistedTarget ?? false
    if (!this.allowUnlistedTarget && this.allowedTargetOrigins === null && this.allowedTargets.length === 0) {
      throw new Error(
        'Webhook target allowlist is required; set allowedTargets or allowedTargetOrigins, or explicitly opt out with allowUnlistedTarget: true',
      )
    }
    this.extraHeaders = options.headers ?? {}
    this.fetchFn = options.fetch ?? (globalThis.fetch as unknown as FetchFn)
    this.sleepFn = options.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
    this.retry = options.retry
      ? {
          maxRetries: validateNonNegativeInteger(options.retry.maxRetries, 'retry.maxRetries'),
          baseDelayMs: validateFiniteNonNegativeNumber(options.retry.baseDelayMs ?? 200, 'retry.baseDelayMs'),
          maxDelayMs: validateFiniteNonNegativeNumber(options.retry.maxDelayMs ?? 30_000, 'retry.maxDelayMs'),
          jitter: options.retry.jitter ?? true,
        }
      : null
  }

  async send(payload: unknown): Promise<void> {
    this.assertTargetAllowed()

    const maxAttempts = this.retry ? 1 + this.retry.maxRetries : 1
    let lastError: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && this.retry) {
        const { baseDelayMs, maxDelayMs, jitter } = this.retry
        const base = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
        const jittered = jitter ? base + seededRandom.random() * baseDelayMs : base
        // Clamp after adding jitter so maxDelayMs remains a true upper bound.
        const delay = Math.min(jittered, maxDelayMs)
        await this.sleepFn(delay)
      }

      let response: Awaited<ReturnType<FetchFn>>
      try {
        response = await this.fetchFn(this.url, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            ...this.extraHeaders,
          },
          body: JSON.stringify(payload),
        })
      } catch (err) {
        lastError = err
        continue
      }

      if (!response.ok) {
        const shouldReadBody = !this.retry || !isTransientStatus(response.status) || attempt === maxAttempts - 1
        const responseBody = shouldReadBody ? await this.readResponseBody(response) : ''
        const bodySuffix = responseBody ? `: ${responseBody}` : ''
        lastError = new Error(
          `Webhook delivery failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''} for ${sanitizeWebhookEndpoint(this.url)}${bodySuffix}`,
        )
        if (!this.retry || !isTransientStatus(response.status) || attempt === maxAttempts - 1) {
          throw lastError
        }
        continue
      }
      return
    }

    throw lastError
  }

  private async readResponseBody(response: Awaited<ReturnType<FetchFn>>): Promise<string> {
    try {
      const readable = response as {
        body?: { getReader?: () => ReadableStreamDefaultReader<Uint8Array> } | null
        text?: () => Promise<string>
      }
      const body = readable.body && typeof readable.body.getReader === 'function'
        ? await this.readBoundedStream(readable.body as ReadableStream<Uint8Array>)
        : ''
      const redactedBody = redactWebhookSecrets(body)
      return redactedBody.length > MAX_ERROR_BODY_CHARS
        ? `${redactedBody.slice(0, MAX_ERROR_BODY_CHARS)}…`
        : redactedBody
    } catch {
      return ''
    }
  }

  private async readBoundedStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    let timedOut = false
    let truncated = false
    const deadlineMs = Date.now() + ERROR_BODY_READ_TIMEOUT_MS

    try {
      while (totalBytes < MAX_ERROR_BODY_CHARS) {
        const remainingMs = deadlineMs - Date.now()
        if (remainingMs <= 0) {
          timedOut = true
          break
        }
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<{ done: true; value?: undefined; timedOut: true }>(resolve => {
          timeoutId = setTimeout(() => resolve({ done: true, timedOut: true }), remainingMs)
        })
        const result = await Promise.race([
          reader.read().then(read => ({ ...read, timedOut: false as const })),
          timeout,
        ]).finally(() => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        })
        if (result.timedOut) {
          timedOut = true
          break
        }
        const { value, done } = result
        if (done || !value) {
          break
        }
        const remainingBytes = MAX_ERROR_BODY_CHARS - totalBytes
        truncated = value.byteLength > remainingBytes
        const boundedChunk = truncated ? value.subarray(0, remainingBytes) : value
        chunks.push(boundedChunk)
        totalBytes += boundedChunk.byteLength
        if (totalBytes >= MAX_ERROR_BODY_CHARS) {
          truncated = true
          break
        }
      }
      if (truncated || timedOut) {
        await reader.cancel()
      }
    } finally {
      reader.releaseLock()
    }

    const decoded = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_ERROR_BODY_CHARS)).trim()
    return truncated || timedOut ? `${decoded}…` : decoded
  }

  private assertTargetAllowed(): void {
    if (this.allowUnlistedTarget) {
      return
    }
    const targetAllowedByOrigin = this.allowedTargetOrigins?.has(this.targetOrigin) ?? false
    const targetAllowedByPath = this.allowedTargets.some(target => {
      if (target.origin !== this.targetOrigin) {
        return false
      }
      return pathMatchesPrefix(this.parsedUrl.pathname, target.pathnamePrefix)
    })
    if (!targetAllowedByOrigin && !targetAllowedByPath) {
      throw new Error(`Webhook target origin ${this.targetOrigin} is not allowed`)
    }
  }
}
