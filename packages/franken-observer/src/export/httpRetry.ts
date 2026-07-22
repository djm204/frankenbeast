import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

import { seededRandom } from '@franken/types';
type FetchResponse = Awaited<ReturnType<FetchFn>>

export interface HttpRetryOptions {
  /**
   * Max retry attempts after the initial try. Default: 0 (no retry).
   * Must be an integer between 0 and 10 to prevent runaway retry loops.
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
  /** Per-attempt request deadline in ms. Default: 10000. */
  attemptTimeoutMs?: number
}

const MAX_HTTP_RETRIES = 10
const DEFAULT_ATTEMPT_TIMEOUT_MS = 10_000

export class HttpAttemptTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`HTTP attempt timed out after ${timeoutMs}ms`)
    this.name = 'HttpAttemptTimeoutError'
    this.timeoutMs = timeoutMs
  }
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
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_HTTP_RETRIES) {
    throw new Error(`maxRetries must be an integer between 0 and ${MAX_HTTP_RETRIES}`)
  }
  return maxRetries
}

function requireFiniteNonNegative(name: 'baseDelayMs' | 'maxDelayMs', value: number | undefined, defaultValue: number): number {
  const normalized = value ?? defaultValue
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${name} must be a finite non-negative number`)
  }
  return normalized
}

function normalizeAttemptTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_ATTEMPT_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('attemptTimeoutMs must be a finite positive number')
  }
  return timeoutMs
}

async function runWithDeadline(
  attempt: (signal: AbortSignal) => Promise<FetchResponse>,
  timeoutMs: number,
): Promise<FetchResponse> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutError = new HttpAttemptTimeoutError(timeoutMs)
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(timeoutError)
      reject(timeoutError)
    }, timeoutMs)
  })

  try {
    return await Promise.race([attempt(controller.signal), deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Invoke `attempt` with a bounded per-attempt deadline and exponential backoff.
 * Each attempt receives an AbortSignal that is aborted when its deadline expires.
 * Retries only transient failures: thrown errors (including timeouts), 5xx
 * responses, and 429 rate-limit responses. Other 4xx responses are returned
 * immediately to the caller with no retry. The caller is responsible for
 * turning a non-ok response into an error.
 * On exhaustion, the last transient response is returned (so the caller throws
 * its own formatted error) and the last network error is rethrown.
 */
export async function fetchWithRetry(
  attempt: (signal: AbortSignal) => Promise<FetchResponse>,
  options: HttpRetryOptions = {},
): Promise<FetchResponse> {
  const maxRetries = normalizeMaxRetries(options.maxRetries)
  const attemptTimeoutMs = normalizeAttemptTimeoutMs(options.attemptTimeoutMs)
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
      const response = await runWithDeadline(attempt, attemptTimeoutMs)
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
