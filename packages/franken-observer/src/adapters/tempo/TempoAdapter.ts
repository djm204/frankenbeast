import type { ExportAdapter } from '../../export/ExportAdapter.js'
import type { Trace } from '../../core/types.js'
import type { FetchFn } from '../langfuse/LangfuseAdapter.js'
import { OTELSerializer } from '../../export/OTELSerializer.js'
import { fetchWithRetry, type HttpRetryOptions } from '../../export/httpRetry.js'

export interface TempoBasicAuth {
  /** Grafana Cloud instance ID (numeric string) or a username. */
  user: string
  /** Grafana Cloud API key or password. */
  password: string
}

export interface TempoAdapterOptions {
  /**
   * Base URL of the Tempo or OTLP/HTTP collector endpoint.
   *
   * Examples:
   * - Grafana Cloud:  `'https://otlp-gateway-<REGION>.grafana.net'`
   * - Local Tempo:    `'http://localhost:4318'`
   */
  endpoint: string

  /**
   * OTLP/HTTP traces path appended to `endpoint`.
   * Default: `'/v1/traces'`
   *
   * For Grafana Cloud use the OTLP gateway traces path: `'/otlp/v1/traces'`.
   */
  otlpPath?: string

  /** HTTP Basic auth credentials. Omit for unauthenticated local Tempo. */
  basicAuth?: TempoBasicAuth

  /** Injectable for testing. Defaults to globalThis.fetch. */
  fetch?: FetchFn

  /**
   * Retry and per-attempt deadline overrides for transient (429/5xx/network)
   * failures. Defaults to 2 retries with bounded exponential backoff, jitter,
   * and a 10 second request deadline. Set `maxRetries: 0` to disable retries.
   */
  retry?: HttpRetryOptions
}

const DEFAULT_TEMPO_RETRY: Readonly<HttpRetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
  jitter: true,
  attemptTimeoutMs: 10_000,
}

/**
 * Write-only ExportAdapter that POSTs OTEL trace payloads to a Grafana Tempo
 * (or any OTLP/HTTP-compatible) endpoint.
 *
 * queryByTraceId / listTraceIds return null / [] — Tempo is a push-only
 * sink from this SDK's perspective.
 */
export class TempoAdapter implements ExportAdapter {
  private readonly tracesUrl: string
  private readonly authHeader: string | undefined
  private readonly fetchFn: FetchFn
  private readonly retry: HttpRetryOptions

  constructor(options: TempoAdapterOptions) {
    const base = options.endpoint.replace(/\/$/, '')
    const path = options.otlpPath ?? '/v1/traces'
    this.tracesUrl = `${base}${path}`

    if (options.basicAuth) {
      const { user, password } = options.basicAuth
      this.authHeader = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
    }

    this.fetchFn = options.fetch ?? (globalThis.fetch as unknown as FetchFn)
    this.retry = { ...DEFAULT_TEMPO_RETRY, ...options.retry }
  }

  async flush(trace: Trace): Promise<void> {
    const payload = OTELSerializer.serializeTrace(trace)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.authHeader) headers['Authorization'] = this.authHeader

    const response = await fetchWithRetry(
      signal =>
        this.fetchFn(this.tracesUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal,
        }),
      this.retry,
    )

    if (!response.ok) {
      throw new Error(
        `Tempo export failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      )
    }
  }

  async queryByTraceId(_traceId: string): Promise<Trace | null> {
    return null
  }

  async listTraceIds(): Promise<string[]> {
    return []
  }
}
