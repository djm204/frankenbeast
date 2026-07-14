import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

import { seededRandom } from '@franken/types';
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

function parseUrlOrigin(value: string, fieldName: string): string {
  try {
    return new URL(value).origin
  } catch {
    throw new TypeError(`${fieldName} must be an absolute URL`)
  }
}

function normalizeAllowedTargetOrigins(origins: readonly string[] | undefined): ReadonlySet<string> | null {
  if (!origins || origins.length === 0) {
    return null
  }

  return new Set(origins.map(origin => parseUrlOrigin(origin, 'allowedTargetOrigins entry')))
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
  private readonly targetOrigin: string
  private readonly allowedTargetOrigins: ReadonlySet<string> | null
  private readonly allowUnlistedTarget: boolean
  private readonly extraHeaders: Record<string, string>
  private readonly fetchFn: FetchFn
  private readonly retry: Required<WebhookRetryOptions> | null
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(options: WebhookNotifierOptions) {
    this.url = options.url
    this.targetOrigin = parseUrlOrigin(options.url, 'url')
    this.allowedTargetOrigins = normalizeAllowedTargetOrigins(options.allowedTargetOrigins)
    this.allowUnlistedTarget = options.allowUnlistedTarget ?? false
    if (!this.allowUnlistedTarget && this.allowedTargetOrigins === null) {
      throw new Error(
        'Webhook target allowlist is required; set allowedTargetOrigins or explicitly opt out with allowUnlistedTarget: true',
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
    if (!this.allowedTargetOrigins?.has(this.targetOrigin)) {
      throw new Error(`Webhook target origin ${this.targetOrigin} is not allowed`)
    }
  }
}
