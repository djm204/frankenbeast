import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

type FetchResponse = Awaited<ReturnType<FetchFn>>

export interface HttpRetryOptions {
  /** Max retry attempts after the initial try. Default: 0 (no retry). */
  maxRetries?: number
  /** Base delay in ms before the first retry. Default: 200. */
  baseDelayMs?: number
  /** Max delay cap in ms. Default: 30000. */
  maxDelayMs?: number
  /** Add up to baseDelayMs of random jitter to each delay. Default: true. */
  jitter?: boolean
  /** Injectable sleep for testing without real timers. Default: setTimeout wrapper. */
  sleep?: (ms: number) => Promise<void>
}

/** A 5xx response is transient and worth retrying; 4xx is the caller's fault and is not. */
function isTransientStatus(status: number): boolean {
  return status >= 500 && status <= 599
}

/**
 * Invoke `attempt` with bounded exponential backoff. Retries only transient
 * failures: thrown errors (network) and 5xx responses. A 4xx response is
 * returned immediately to the caller with no retry. The caller is responsible
 * for turning a non-ok response into an error. On exhaustion, the last 5xx
 * response is returned (so the caller throws its own formatted error) and the
 * last network error is rethrown.
 */
export async function fetchWithRetry(
  attempt: () => Promise<FetchResponse>,
  options: HttpRetryOptions = {},
): Promise<FetchResponse> {
  const maxRetries = options.maxRetries ?? 0
  const baseDelayMs = options.baseDelayMs ?? 200
  const maxDelayMs = options.maxDelayMs ?? 30_000
  const jitter = options.jitter ?? true
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))

  const maxAttempts = 1 + maxRetries
  let lastError: unknown

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      const base = Math.min(baseDelayMs * 2 ** (i - 1), maxDelayMs)
      const delay = jitter ? base + Math.random() * baseDelayMs : base
      await sleep(delay)
    }
    try {
      const response = await attempt()
      // Success or a non-transient (4xx) response → return; the caller decides.
      if (response.ok || !isTransientStatus(response.status)) return response
      lastError = new Error(`transient HTTP ${response.status}`)
      if (i === maxAttempts - 1) return response // exhausted: hand the last 5xx back
    } catch (err) {
      lastError = err
      if (i === maxAttempts - 1) throw lastError
    }
  }
  // Unreachable given maxAttempts >= 1, but satisfies the type checker.
  throw lastError
}
