import type { ExportAdapter } from '../../export/ExportAdapter.js'
import type { Trace } from '../../core/types.js'
import { OTELSerializer } from '../../export/OTELSerializer.js'
import { fetchWithRetry, type HttpRetryOptions } from '../../export/httpRetry.js'

export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; redirect?: 'error' | 'follow' | 'manual' },
) => Promise<{ ok: boolean; status: number; statusText?: string }>

export interface LangfuseAdapterOptions {
  /** Langfuse host. Default: 'https://cloud.langfuse.com' */
  baseUrl?: string
  publicKey: string
  secretKey: string
  /** Injectable for testing. Defaults to globalThis.fetch. */
  fetch?: FetchFn
  /** Retry on transient (5xx/network) failures. Omit for a single attempt. */
  retry?: HttpRetryOptions
}

/**
 * Write-only ExportAdapter that POSTs OTEL trace payloads to a Langfuse
 * (or Phoenix) ingest endpoint over HTTP. queryByTraceId / listTraceIds
 * return null / [] because Langfuse is a push-only sink from this SDK's
 * perspective.
 */
export class LangfuseAdapter implements ExportAdapter {
  private readonly baseUrl: string
  private readonly authHeader: string
  private readonly fetchFn: FetchFn
  private readonly retry: HttpRetryOptions | undefined

  constructor(options: LangfuseAdapterOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://cloud.langfuse.com').replace(/\/$/, '')
    this.authHeader = `Basic ${Buffer.from(`${options.publicKey}:${options.secretKey}`).toString('base64')}`
    this.fetchFn = options.fetch ?? (globalThis.fetch as unknown as FetchFn)
    this.retry = options.retry
  }

  async flush(trace: Trace): Promise<void> {
    const payload = OTELSerializer.serializeTrace(trace)
    const url = `${this.baseUrl}/api/public/otel/v1/traces`
    const response = await fetchWithRetry(
      () =>
        this.fetchFn(url, {
          method: 'POST',
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
      this.retry,
    )
    if (!response.ok) {
      throw new Error(
        `Langfuse export failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
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
