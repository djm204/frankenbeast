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

export interface WebhookNotifierOptions {
  /** URL to POST the JSON payload to. */
  url: string
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
 *   retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 5000 },
 * })
 * ```
 */
export class WebhookNotifier {
  private readonly url: string
  private readonly extraHeaders: Record<string, string>
  private readonly fetchFn: FetchFn
  private readonly retry: Required<WebhookRetryOptions> | null
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(options: WebhookNotifierOptions) {
    this.url = options.url
    this.extraHeaders = options.headers ?? {}
    this.fetchFn = options.fetch ?? (globalThis.fetch as unknown as FetchFn)
    this.sleepFn = options.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
    this.retry = options.retry
      ? {
          maxRetries: options.retry.maxRetries,
          baseDelayMs: options.retry.baseDelayMs ?? 200,
          maxDelayMs: options.retry.maxDelayMs ?? 30_000,
          jitter: options.retry.jitter ?? true,
        }
      : null
  }

  async send(payload: unknown): Promise<void> {
    const maxAttempts = this.retry ? 1 + this.retry.maxRetries : 1
    let lastError: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && this.retry) {
        const { baseDelayMs, maxDelayMs, jitter } = this.retry
        const base = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
        const delay = jitter ? base + Math.random() * baseDelayMs : base
        await this.sleepFn(delay)
      }

      try {
        const response = await this.fetchFn(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.extraHeaders,
          },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          lastError = new Error(
            `Webhook delivery failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
          )
          continue
        }
        return
      } catch (err) {
        lastError = err
      }
    }

    throw lastError
  }
}
