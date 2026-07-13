import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seededRandom } from '@franken/types'
import { WebhookNotifier } from './WebhookNotifier.js'
import { CircuitBreaker } from '../cost/CircuitBreaker.js'
import { LoopDetector } from '../incident/LoopDetector.js'

describe('WebhookNotifier', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  const drainAlreadyQueuedMicrotasks = async () => {
    // CircuitBreaker emits limit events synchronously. The below-limit negative
    // path should only need to drain promise continuations already queued by
    // the test harness; do not use a zero-delay macrotask sleep.
    await Promise.resolve()
  }
  const webhookUrl = 'https://hooks.example.com/signal'
  const allowedTargetOrigins = ['https://hooks.example.com']
  const responseBody = (value: string) => new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value))
      controller.close()
    },
  })

  const createNotifier = (options: Partial<ConstructorParameters<typeof WebhookNotifier>[0]> = {}) =>
    new WebhookNotifier({
      url: webhookUrl,
      allowedTargetOrigins,
      fetch: mockFetch,
      ...options,
    })

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
  })

  describe('send()', () => {
    it('POSTs to the configured URL', async () => {
      const notifier = createNotifier()
      await notifier.send({ type: 'test' })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://hooks.example.com/signal')
    })

    it('uses HTTP POST method', async () => {
      const notifier = createNotifier()
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.method).toBe('POST')
    })

    it('does not follow redirects automatically', async () => {
      const notifier = createNotifier()
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.redirect).toBe('manual')
    })

    it('sends Content-Type: application/json', async () => {
      const notifier = createNotifier()
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/json')
    })

    it('serialises the payload as a JSON body', async () => {
      const notifier = createNotifier()
      await notifier.send({ type: 'circuit-breaker', spendUsd: 1.5, limitUsd: 1.0 })
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ type: 'circuit-breaker', spendUsd: 1.5, limitUsd: 1.0 })
    })

    it('merges custom headers with Content-Type', async () => {
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        headers: { 'X-Api-Key': 'test-api-key', Authorization: 'Bearer test-token' },
        fetch: mockFetch,
      })
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/json')
      expect(init.headers['X-Api-Key']).toBe('test-api-key')
      expect(init.headers['Authorization']).toBe('Bearer test-token')
    })

    it('custom headers can override Content-Type', async () => {
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        headers: { 'Content-Type': 'application/vnd.custom+json' },
        fetch: mockFetch,
      })
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/vnd.custom+json')
    })

    it('throws if the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('500')
    })

    it('error message includes the status text', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('Forbidden')
    })

    it('error message includes webhook endpoint and response body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        body: responseBody('{"error":"bad payload"}'),
      })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 422 Unprocessable Entity for https://hooks.example.com/[REDACTED]: {"error":"bad payload"}',
      )
    })

    it('redacts secret webhook URL components from HTTP error messages', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        statusText: 'Gone',
        body: responseBody('disabled at https://hooks.example.com/services/aaa.bbb.cccccccccccccccccccccccccccccc?debug=true'),
      })
      const notifier = createNotifier({
        url: 'https://hooks.example.com/services/aaa.bbb.cccccccccccccccccccccccccccccc?debug=true',
        allowedTargetOrigins,
      })

      await notifier.send({ type: 'test' }).catch((error: Error) => {
        expect(error.message).toContain('Webhook delivery failed: 410 Gone for https://hooks.example.com/')
        expect(error.message).toContain('disabled at https://hooks.example.com/')
        expect(error.message).not.toContain('aaa.bbb')
        expect(error.message).not.toContain('debug=true')
      })
    })

    it('defers reading retryable response bodies until the final attempt', async () => {
      const text = vi.fn().mockResolvedValue('{"error":"still down"}')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        body: responseBody('{"error":"still down"}'),
        text,
      })
      const notifier = createNotifier({
        retry: { maxRetries: 1, jitter: false },
        sleep: vi.fn().mockResolvedValue(undefined),
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 503 Service Unavailable for https://hooks.example.com/[REDACTED]: {"error":"still down"}',
      )
      expect(text).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('truncates oversized HTTP error bodies', async () => {
      const text = vi.fn().mockResolvedValue('x'.repeat(3000))
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(3000)))
          controller.close()
        },
      })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: stream,
        text,
      })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        `Webhook delivery failed: 500 Internal Server Error for https://hooks.example.com/[REDACTED]: ${'x'.repeat(2048)}`,
      )
      expect(text).not.toHaveBeenCalled()
    })

    it('redacts echoed authentication headers from HTTP error bodies', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: responseBody('Authorization: Bearer *** X-Api-Key=other-secret'),
      })
      const notifier = createNotifier()
      await notifier.send({ type: 'test' }).catch((error: Error) => {
        expect(error.message).toContain(
          'Webhook delivery failed: 401 Unauthorized for https://hooks.example.com/[REDACTED]: Authorization:',
        )
        expect(error.message).not.toContain('other-secret')
      })
    })

    it('redacts quoted echoed authentication headers from HTTP error bodies', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: responseBody('{"Authorization":"Bearer secret-token","x-api-key":"other-secret"}'),
      })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 401 Unauthorized for https://hooks.example.com/[REDACTED]: {"Authorization":"[REDACTED]","x-api-key":"[REDACTED]"}',
      )
    })

    it('redacts array-valued echoed authentication headers from HTTP error bodies', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: responseBody('{"Authorization":["Bearer secret-token"],"x-api-key":["other-secret"]}'),
      })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 401 Unauthorized for https://hooks.example.com/[REDACTED]: {"Authorization":["[REDACTED]"],"x-api-key":["[REDACTED]"]}',
      )
    })

    it('skips body context instead of buffering non-Web response streams', async () => {
      const text = vi.fn().mockResolvedValue('body from text fallback')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: { pipe: vi.fn() },
        text,
      })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 500 Internal Server Error for https://hooks.example.com/[REDACTED]',
      )
      expect(text).not.toHaveBeenCalled()
    })

    it('redacts truncated quoted authentication fields from streamed error bodies', async () => {
      const secret = 's'.repeat(3000)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: responseBody(`{"Authorization":"Bearer ${secret}`),
      })
      const notifier = createNotifier()

      await notifier.send({ type: 'test' }).catch((error: Error) => {
        expect(error.message).toContain(
          'Webhook delivery failed: 401 Unauthorized for https://hooks.example.com/[REDACTED]: {"Authorization":"[REDACTED]"',
        )
        expect(error.message).not.toContain(secret.slice(0, 32))
      })
    })

    it('redacts short webhook path secrets from error endpoints', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        statusText: 'Gone',
        body: responseBody('gone'),
      })
      const notifier = createNotifier({
        url: 'https://hooks.example.com/h/abc123',
        allowedTargetOrigins,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 410 Gone for https://hooks.example.com/[REDACTED]/[REDACTED]: gone',
      )
    })

    it('stops waiting on stalled error-body streams', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('partial diagnostic'))
        },
        cancel: vi.fn(),
      })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: stream,
      })
      const notifier = createNotifier()

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 500 Internal Server Error for https://hooks.example.com/[REDACTED]: partial diagnostic',
      )
    })

    it('stops waiting on slow-drip error-body streams after the overall body deadline', async () => {
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise(resolve => setTimeout(resolve, 25))
          controller.enqueue(new TextEncoder().encode('x'))
        },
        cancel: vi.fn(),
      })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: stream,
      })
      const notifier = createNotifier()
      const startedAt = Date.now()

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 500 Internal Server Error for https://hooks.example.com/[REDACTED]:',
      )
      expect(Date.now() - startedAt).toBeLessThan(750)
    })

    it('rethrows if fetch itself rejects (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('ECONNREFUSED')
    })

    it('accepts any JSON-serialisable payload', async () => {
      const notifier = createNotifier()
      await notifier.send(['a', 'b', 'c'])
      const [, init] = mockFetch.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual(['a', 'b', 'c'])
    })

    it('requires an explicit target allowlist by default', () => {
      expect(() => new WebhookNotifier({ url: webhookUrl, fetch: mockFetch })).toThrow(
        'Webhook target allowlist is required',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('denies webhook targets outside the configured allowlist before sending', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://evil.example.net/signal',
        allowedTargetOrigins,
        fetch: mockFetch,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook target origin https://evil.example.net is not allowed',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('allows explicit unsafe opt-out for legacy deployments', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://legacy.example.net/signal',
        allowUnlistedTarget: true,
        fetch: mockFetch,
      })

      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('integration with CircuitBreaker', () => {
    it('delivers a circuit-breaker payload via fire-and-forget wiring', async () => {
      // Resolve only once mockFetch is actually invoked so we don't rely on setTimeout
      let resolveOnDelivery!: () => void
      const delivered = new Promise<void>(r => (resolveOnDelivery = r))
      mockFetch.mockImplementation(async () => {
        resolveOnDelivery()
        return { ok: true, status: 200, statusText: 'OK' }
      })

      const notifier = createNotifier()
      const breaker = new CircuitBreaker({ limitUsd: 1.0 })

      breaker.on('limit-reached', result => {
        void notifier.send({ type: 'circuit-breaker', ...result })
      })

      breaker.check(1.5) // trips the breaker
      await delivered

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://hooks.example.com/signal')
      const body = JSON.parse(init.body as string)
      expect(body.type).toBe('circuit-breaker')
      expect(body.tripped).toBe(true)
      expect(body.spendUsd).toBe(1.5)
    })

    it('does not fire when spend is below the limit', async () => {
      const notifier = createNotifier()
      const breaker = new CircuitBreaker({ limitUsd: 5.0 })
      breaker.on('limit-reached', result => {
        void notifier.send({ type: 'circuit-breaker', ...result })
      })
      breaker.check(1.0) // below limit
      await drainAlreadyQueuedMicrotasks()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('retry with exponential backoff', () => {
    it('succeeds without retrying when first attempt is ok', async () => {
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 2 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('retries after a non-ok response and succeeds on the second attempt', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 3 },
        sleep: sleepFn,
      })
      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(sleepFn).toHaveBeenCalledTimes(1)
    })

    it('throws after exhausting all retries', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 2 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('503')
      expect(mockFetch).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('doubles the delay on each retry (exponential backoff)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 3, baseDelayMs: 100, jitter: false },
        sleep: sleepFn,
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow()
      const delays = sleepFn.mock.calls.map((args: unknown[]) => args[0] as number)
      expect(delays[0]).toBe(100)  // 100 * 2^0
      expect(delays[1]).toBe(200)  // 100 * 2^1
      expect(delays[2]).toBe(400)  // 100 * 2^2
    })

    it('caps delay at maxDelayMs', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 4, baseDelayMs: 100, maxDelayMs: 250, jitter: false },
        sleep: sleepFn,
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow()
      const delays = sleepFn.mock.calls.map((args: unknown[]) => args[0] as number)
      expect(delays[0]).toBe(100)
      expect(delays[1]).toBe(200)
      expect(delays[2]).toBe(250) // capped
      expect(delays[3]).toBe(250) // capped
    })

    it('clamps jittered delay at maxDelayMs', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const randomSpy = vi.spyOn(seededRandom, 'random').mockReturnValue(0.99)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 1, baseDelayMs: 200, maxDelayMs: 200, jitter: true },
        sleep: sleepFn,
      })

      try {
        await expect(notifier.send({ type: 'test' })).rejects.toThrow()

        expect(sleepFn).toHaveBeenCalledWith(200)
      } finally {
        randomSpy.mockRestore()
      }
    })

    it('does not retry non-transient 4xx responses', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 3 },
        sleep: sleepFn,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow('401')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(sleepFn).not.toHaveBeenCalled()
    })

    it('still retries 429 responses', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 2, jitter: false },
        sleep: sleepFn,
      })

      await notifier.send({ type: 'test' })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(sleepFn).toHaveBeenCalledTimes(1)
    })

    it('retries on network errors (fetch rejection)', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 2 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws the last network error after exhausting retries', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 1 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('ECONNREFUSED')
    })

    it('is backwards-compatible: no retry option means single attempt', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
      const notifier = createNotifier()
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('500')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('rejects negative maxRetries during retry configuration validation', () => {
      expect(
        () =>
          createNotifier({
            retry: { maxRetries: -2 },
          }),
      ).toThrow('retry.maxRetries must be a non-negative integer')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects non-finite maxRetries during retry configuration validation', () => {
      expect(
        () =>
          createNotifier({
            retry: { maxRetries: Number.NaN },
          }),
      ).toThrow('retry.maxRetries must be a non-negative integer')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects fractional maxRetries during retry configuration validation', () => {
      expect(
        () =>
          createNotifier({
            retry: { maxRetries: 1.5 },
          }),
      ).toThrow('retry.maxRetries must be a non-negative integer')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('adds jitter (delay is not exactly baseDelayMs * 2^i)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch,
        retry: { maxRetries: 2, baseDelayMs: 100, jitter: true },
        sleep: sleepFn,
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow()
      const delays = sleepFn.mock.calls.map((args: unknown[]) => args[0] as number)
      // With jitter each delay is base*2^i + random(0..base), so >= base*2^i and < 2*base*2^i
      expect(delays[0]).toBeGreaterThanOrEqual(100)
      expect(delays[0]).toBeLessThan(200)
      expect(delays[1]).toBeGreaterThanOrEqual(200)
      expect(delays[1]).toBeLessThan(400)
    })
  })

  describe('integration with LoopDetector', () => {
    it('delivers a loop-detected payload via fire-and-forget wiring', async () => {
      let resolveOnDelivery!: () => void
      const delivered = new Promise<void>(r => (resolveOnDelivery = r))
      mockFetch.mockImplementation(async () => {
        resolveOnDelivery()
        return { ok: true, status: 200, statusText: 'OK' }
      })

      const notifier = createNotifier()
      const detector = new LoopDetector({ windowSize: 2, repeatThreshold: 2 })

      detector.on('loop-detected', result => {
        void notifier.send({ type: 'loop-detected', ...result })
      })

      for (const name of ['a', 'b', 'a', 'b']) {
        detector.check(name)
      }
      await delivered

      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body.type).toBe('loop-detected')
      expect(body.detectedPattern).toEqual(['a', 'b'])
      expect(body.repetitions).toBe(2)
    })
  })
})
