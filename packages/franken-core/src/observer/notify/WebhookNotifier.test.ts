import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebhookNotifier } from './WebhookNotifier.js'
import { CircuitBreaker } from '../cost/CircuitBreaker.js'
import { LoopDetector } from '../incident/LoopDetector.js'

describe('WebhookNotifier', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
  })

  describe('send()', () => {
    it('POSTs to the configured URL', async () => {
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await notifier.send({ type: 'test' })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://hooks.example.com/signal')
    })

    it('uses HTTP POST method', async () => {
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.method).toBe('POST')
    })

    it('sends Content-Type: application/json', async () => {
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/json')
    })

    it('serialises the payload as a JSON body', async () => {
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await notifier.send({ type: 'circuit-breaker', spendUsd: 1.5, limitUsd: 1.0 })
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ type: 'circuit-breaker', spendUsd: 1.5, limitUsd: 1.0 })
    })

    it('merges custom headers with Content-Type', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        headers: { 'X-Api-Key': 'secret', Authorization: 'Bearer token' },
        fetch: mockFetch as any,
      })
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/json')
      expect(init.headers['X-Api-Key']).toBe('secret')
      expect(init.headers['Authorization']).toBe('Bearer token')
    })

    it('custom headers can override Content-Type', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        headers: { 'Content-Type': 'application/vnd.custom+json' },
        fetch: mockFetch as any,
      })
      await notifier.send({ type: 'test' })
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/vnd.custom+json')
    })

    it('throws if the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('500')
    })

    it('error message includes the status text', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' })
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('Forbidden')
    })

    it('rethrows if fetch itself rejects (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('ECONNREFUSED')
    })

    it('accepts any JSON-serialisable payload', async () => {
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await notifier.send(['a', 'b', 'c'])
      const [, init] = mockFetch.mock.calls[0]
      expect(JSON.parse(init.body as string)).toEqual(['a', 'b', 'c'])
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

      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
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
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      const breaker = new CircuitBreaker({ limitUsd: 5.0 })
      breaker.on('limit-reached', result => {
        void notifier.send({ type: 'circuit-breaker', ...result })
      })
      breaker.check(1.0) // below limit
      // Give the event loop a tick — no delivery should happen
      await new Promise(r => setTimeout(r, 0))
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('retry with exponential backoff', () => {
    it('succeeds without retrying when first attempt is ok', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
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
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 3 },
        sleep: sleepFn,
      })
      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(sleepFn).toHaveBeenCalledTimes(1)
    })

    it('throws after exhausting all retries', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 2 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('503')
      expect(mockFetch).toHaveBeenCalledTimes(3) // initial + 2 retries
    })

    it('doubles the delay on each retry (exponential backoff)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 3, baseDelayMs: 100, jitter: false },
        sleep: sleepFn,
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow()
      const delays = sleepFn.mock.calls.map(args => args[0] as number)
      expect(delays[0]).toBe(100)  // 100 * 2^0
      expect(delays[1]).toBe(200)  // 100 * 2^1
      expect(delays[2]).toBe(400)  // 100 * 2^2
    })

    it('caps delay at maxDelayMs', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 4, baseDelayMs: 100, maxDelayMs: 250, jitter: false },
        sleep: sleepFn,
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow()
      const delays = sleepFn.mock.calls.map(args => args[0] as number)
      expect(delays[0]).toBe(100)
      expect(delays[1]).toBe(200)
      expect(delays[2]).toBe(250) // capped
      expect(delays[3]).toBe(250) // capped
    })

    it('retries on network errors (fetch rejection)', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 2 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws the last network error after exhausting retries', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 1 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('ECONNREFUSED')
    })

    it('is backwards-compatible: no retry option means single attempt', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow('500')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('adds jitter (delay is not exactly baseDelayMs * 2^i)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        fetch: mockFetch as any,
        retry: { maxRetries: 2, baseDelayMs: 100, jitter: true },
        sleep: sleepFn,
      })
      await expect(notifier.send({ type: 'test' })).rejects.toThrow()
      const delays = sleepFn.mock.calls.map(args => args[0] as number)
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

      const notifier = new WebhookNotifier({ url: 'https://hooks.example.com/signal', fetch: mockFetch as any })
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
