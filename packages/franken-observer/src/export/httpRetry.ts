import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

import { seededRandom } from '@franken/types';
type FetchResponse = Awaited<ReturnType<FetchFn>>

export interface HttpRetryOptions {
  /**
   * Max retry attempts after the initial try. Default: 0 (no retry).
   * Invalid, negative, or non-finite values are clamped to 0; fractional
   * values are floored so the initial attempt is never skipped.
   */
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

/**
 * A response is transient and worth retrying when it is a 5xx server error or a
 * 429 (Too Many Requests) rate-limit response. Other 4xx responses are the
 * caller's fault and are not retried.
 */
function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function normalizeMaxRetries(maxRetries: number | undefined): number {
  if (maxRetries === undefined) return 0
  if (!Number.isFinite(maxRetries) || maxRetries < 0) return 0
  return Math.floor(maxRetries)
}

function requireFiniteNonNegative(name: 'baseDelayMs' | 'maxDelayMs', value: number | undefined, defaultValue: number): number {
  const normalized = value ?? defaultValue
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${name} must be a finite non-negative number`)
  }
  return normalized
}

/**
 * Invoke `attempt` with bounded exponential backoff. Retries only transient
 * failures: thrown errors (network), 5xx responses, and 429 rate-limit
 * responses. Other 4xx responses are returned immediately to the caller with no
 * retry. The caller is responsible for turning a non-ok response into an error.
 * On exhaustion, the last transient response is returned (so the caller throws
 * its own formatted error) and the last network error is rethrown.
 */
export async function fetchWithRetry(
  attempt: () => Promise<FetchResponse>,
  options: HttpRetryOptions = {},
): Promise<FetchResponse> {
  const maxRetries = normalizeMaxRetries(options.maxRetries)
  const jitter = options.jitter ?? true
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))

  const maxAttempts = 1 + maxRetries
  let lastError: unknown

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      const baseDelayMs = requireFiniteNonNegative('baseDelayMs', options.baseDelayMs, 200)
      const maxDelayMs = requireFiniteNonNegative('maxDelayMs', options.maxDelayMs, 30_000)
      const base = Math.min(baseDelayMs * 2 ** (i - 1), maxDelayMs)
      // Clamp AFTER jitter so maxDelayMs is a true upper bound (callers rely on
      // it to cap shutdown-sensitive export latency).
      const delay = jitter ? Math.min(base + seededRandom.random() * baseDelayMs, maxDelayMs) : base
      await sleep(delay)
    }
    try {
      const response = await attempt()
      // Success or a non-transient (non-429 4xx) response → return; the caller decides.
      if (response.ok || !isTransientStatus(response.status)) return response
      lastError = new Error(`transient HTTP ${response.status}`)
      if (i === maxAttempts - 1) return response // exhausted: hand the last transient response back
    } catch (err) {
      lastError = err
      if (i === maxAttempts - 1) throw lastError
    }
  }
  // Unreachable given maxAttempts >= 1, but satisfies the type checker.
  throw lastError
}
