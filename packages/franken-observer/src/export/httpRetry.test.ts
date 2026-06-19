import { describe, it, expect, vi } from 'vitest'
import { fetchWithRetry } from './httpRetry.js'

const ok = { ok: true, status: 200, statusText: 'OK' }
const serverError = { ok: false, status: 503, statusText: 'Service Unavailable' }
const badRequest = { ok: false, status: 400, statusText: 'Bad Request' }
const rateLimited = { ok: false, status: 429, statusText: 'Too Many Requests' }

function noSleep() {
  return vi.fn().mockResolvedValue(undefined)
}

describe('fetchWithRetry (issue #68)', () => {
  it('retries a 5xx then succeeds', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockResolvedValueOnce(serverError).mockResolvedValueOnce(ok)
    const res = await fetchWithRetry(attempt, { maxRetries: 2, sleep })
    expect(res).toEqual(ok)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('retries a thrown network error then succeeds', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(ok)
    const res = await fetchWithRetry(attempt, { maxRetries: 2, sleep })
    expect(res).toEqual(ok)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('returns the last 5xx response after exhausting retries', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockResolvedValue(serverError)
    const res = await fetchWithRetry(attempt, { maxRetries: 2, sleep })
    expect(res).toEqual(serverError)
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('rethrows the last network error after exhausting retries', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockRejectedValue(new Error('down'))
    await expect(fetchWithRetry(attempt, { maxRetries: 2, sleep })).rejects.toThrow('down')
    expect(attempt).toHaveBeenCalledTimes(3)
  })

  it('retries a 429 rate-limit response then succeeds', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok)
    const res = await fetchWithRetry(attempt, { maxRetries: 2, sleep })
    expect(res).toEqual(ok)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry a 4xx — returns it immediately', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockResolvedValue(badRequest)
    const res = await fetchWithRetry(attempt, { maxRetries: 3, sleep })
    expect(res).toEqual(badRequest)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('makes a single attempt when maxRetries is omitted', async () => {
    const attempt = vi.fn().mockResolvedValue(serverError)
    const res = await fetchWithRetry(attempt)
    expect(res).toEqual(serverError)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('applies capped exponential backoff with jitter disabled', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockResolvedValue(serverError)
    await fetchWithRetry(attempt, { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 250, jitter: false, sleep })
    expect(sleep.mock.calls.map(c => c[0])).toEqual([100, 200, 250])
  })

  it('never sleeps longer than maxDelayMs even with jitter enabled', async () => {
    const sleep = noSleep()
    const attempt = vi.fn().mockResolvedValue(serverError)
    await fetchWithRetry(attempt, { maxRetries: 5, baseDelayMs: 100, maxDelayMs: 250, jitter: true, sleep })
    for (const [delay] of sleep.mock.calls) {
      expect(delay).toBeLessThanOrEqual(250)
    }
  })
})
