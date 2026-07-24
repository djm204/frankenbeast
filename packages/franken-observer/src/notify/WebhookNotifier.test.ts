import { EventEmitter } from 'node:events'
import { request as httpsRequest } from 'node:https'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seededRandom } from '@franken/types'
import { InMemoryWebhookDeliveryReceiptStore, WebhookNotifier } from './WebhookNotifier.js'
import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

vi.mock('node:https', () => ({
  request: vi.fn(),
}))
import { CircuitBreaker } from '../cost/CircuitBreaker.js'
import { LoopDetector } from '../incident/LoopDetector.js'

describe('WebhookNotifier', () => {
  let mockFetch: ReturnType<typeof vi.fn> & FetchFn

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
  const mockPinnedHttpsResponse = (statusCode = 204, statusMessage = 'No Content', bodyChunks: readonly string[] = []) => {
    const request = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
    request.write = vi.fn()
    request.end = vi.fn(() => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number
        statusMessage: string
        [Symbol.asyncIterator]: () => AsyncIterator<Buffer>
      }
      response.statusCode = statusCode
      response.statusMessage = statusMessage
      response[Symbol.asyncIterator] = async function * () {
        for (const chunk of bodyChunks) {
          yield Buffer.from(chunk)
        }
      }
      const callback = vi.mocked(httpsRequest).mock.calls.at(-1)?.[1]
      callback?.(response as never)
    })
    vi.mocked(httpsRequest).mockReturnValue(request as never)
    return request
  }

  const createNotifier = (options: Partial<ConstructorParameters<typeof WebhookNotifier>[0]> = {}) =>
    new WebhookNotifier({
      url: webhookUrl,
      allowedTargetOrigins,
      fetch: mockFetch,
      ...options,
    })

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }) as ReturnType<typeof vi.fn> & FetchFn
    vi.mocked(httpsRequest).mockReset()
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

    it('hashes the same JSON body bytes that it POSTs for idempotency receipts', async () => {
      const notifier = createNotifier()
      let counter = 0
      const payload = {
        toJSON: () => ({ type: 'status', counter: ++counter }),
      }

      const receipt = await notifier.send(payload, { idempotencyKey: 'status:to-json' })
      const [, init] = mockFetch.mock.calls[0]

      expect(init.body).toBe('{"type":"status","counter":1}')
      expect(receipt.contentHash).toBe('d0914105d3bbe1c64b6f4371dd0a9cd208f2d7b84a8810a11a0dcad554c593e7')
      expect(counter).toBe(1)
    })

    it('records a sent receipt and skips a duplicate idempotency key for the same target and content', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const notifier = createNotifier({ deliveryReceiptStore: store })
      const payload = { type: 'status', runId: 'run-1', state: 'green' }

      const firstReceipt = await notifier.send(payload, { idempotencyKey: 'status:run-1:discord' })
      const secondReceipt = await notifier.send(payload, { idempotencyKey: 'status:run-1:discord' })

      expect(firstReceipt).toMatchObject({
        status: 'sent',
        idempotencyKey: 'status:run-1:discord',
        target: 'https://hooks.example.com/[REDACTED]#951f9d00d945',
      })
      expect(secondReceipt).toMatchObject({
        status: 'skipped',
        idempotencyKey: 'status:run-1:discord',
        target: 'https://hooks.example.com/[REDACTED]#951f9d00d945',
      })
      expect(secondReceipt.contentHash).toBe(firstReceipt.contentHash)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('reserves an idempotency key before delivery so overlapping sends do not duplicate POSTs', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const saved = vi.spyOn(store, 'save')
      let releaseFetch!: () => void
      mockFetch.mockImplementationOnce(
        () => new Promise(resolve => {
          releaseFetch = () => resolve({ ok: true, status: 200, statusText: 'OK' })
        }),
      )
      const notifier = createNotifier({ deliveryReceiptStore: store })
      const payload = { type: 'status', runId: 'run-concurrent', state: 'green' }

      const first = notifier.send(payload, { idempotencyKey: 'status:run-concurrent' })
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      const secondReceipt = await notifier.send(payload, { idempotencyKey: 'status:run-concurrent' })
      releaseFetch()
      const firstReceipt = await first

      expect(firstReceipt.status).toBe('sent')
      expect(secondReceipt.status).toBe('skipped')
      expect(saved.mock.calls.some(call => call[0].status === 'skipped')).toBe(false)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('retries stale pending reservations instead of skipping forever', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const notifier = createNotifier({ deliveryReceiptStore: store })
      const payload = { type: 'status', runId: 'stale-pending', state: 'green' }
      await expect(notifier.send(payload, { idempotencyKey: 'status:stale-pending', target: 'ops' })).rejects.toThrow('503')
      const failed = await store.findLatest('status:stale-pending', 'ops')
      await store.save({ ...failed!, status: 'pending', timestamp: '2000-01-01T00:00:00.000Z' })

      const receipt = await notifier.send(payload, { idempotencyKey: 'status:stale-pending', target: 'ops' })

      expect(receipt.status).toBe('sent')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('does not let stale reservations overwrite newer successful receipts', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const staleReservation = {
        idempotencyKey: 'status:stale-owner',
        target: 'ops',
        contentHash: 'same-content',
        reservationId: 'old-owner',
        status: 'pending' as const,
        timestamp: '2000-01-01T00:00:00.000Z',
      }
      await store.reserve(staleReservation)
      expect(
        await store.completeReservation('new-owner', {
          ...staleReservation,
          reservationId: 'new-owner',
          status: 'sent',
          timestamp: new Date().toISOString(),
        }),
      ).toBe(false)
      await store.save({
        ...staleReservation,
        reservationId: 'new-owner',
        status: 'pending',
        timestamp: '2000-01-01T00:10:00.000Z',
      })
      expect(
        await store.completeReservation('new-owner', {
          ...staleReservation,
          reservationId: 'new-owner',
          status: 'sent',
          timestamp: '2000-01-01T00:10:01.000Z',
        }),
      ).toBe(true)
      expect(
        await store.completeReservation('old-owner', {
          ...staleReservation,
          reservationId: 'old-owner',
          status: 'failed',
          timestamp: '2000-01-01T00:10:02.000Z',
        }),
      ).toBe(false)

      expect(await store.findLatest('status:stale-owner', 'ops')).toMatchObject({ status: 'sent', reservationId: 'new-owner' })
    })

    it('sends changed content for the same idempotency key and target', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const notifier = createNotifier({ deliveryReceiptStore: store })

      const firstReceipt = await notifier.send({ type: 'approval', state: 'pending' }, { idempotencyKey: 'approval:42' })
      const secondReceipt = await notifier.send({ type: 'approval', state: 'approved' }, { idempotencyKey: 'approval:42' })

      expect(firstReceipt.status).toBe('sent')
      expect(secondReceipt.status).toBe('sent')
      expect(secondReceipt.contentHash).not.toBe(firstReceipt.contentHash)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('preserves successful receipts for older content after newer content with the same key fails', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const notifier = createNotifier({ deliveryReceiptStore: store })

      const firstReceipt = await notifier.send({ type: 'approval', state: 'pending' }, { idempotencyKey: 'approval:preserve' })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      await expect(notifier.send({ type: 'approval', state: 'failed' }, { idempotencyKey: 'approval:preserve' })).rejects.toThrow('503')
      const staleRetryReceipt = await notifier.send({ type: 'approval', state: 'pending' }, { idempotencyKey: 'approval:preserve' })

      expect(firstReceipt.status).toBe('sent')
      expect(staleRetryReceipt.status).toBe('skipped')
      expect(staleRetryReceipt.contentHash).toBe(firstReceipt.contentHash)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('records failed receipts and allows retrying the same idempotency key after failure', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const saved = vi.spyOn(store, 'save')
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      const notifier = createNotifier({ deliveryReceiptStore: store })
      const payload = { type: 'doctor', taskId: 't_123', state: 'blocked' }

      await expect(notifier.send(payload, { idempotencyKey: 'doctor:t_123:blocked' })).rejects.toThrow('503')
      const retryReceipt = await notifier.send(payload, { idempotencyKey: 'doctor:t_123:blocked' })

      expect(saved.mock.calls.some(call => call[0].status === 'failed' && call[0].idempotencyKey === 'doctor:t_123:blocked')).toBe(true)
      expect(retryReceipt.status).toBe('sent')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('does not reject after a webhook was delivered but sent receipt persistence failed', async () => {
      const completed: string[] = []
      const store = {
        findLatest: vi.fn(),
        findByContent: vi.fn(),
        reserve: vi.fn().mockResolvedValue(true),
        completeReservation: vi.fn(async (_reservationId, receipt) => {
          completed.push(receipt.status)
          if (receipt.status === 'sent') {
            throw new Error('receipt store unavailable')
          }
          return true
        }),
        save: vi.fn(),
      }
      const notifier = createNotifier({ deliveryReceiptStore: store })

      const receipt = await notifier.send({ type: 'status' }, { idempotencyKey: 'status:store-failure' })

      expect(receipt.status).toBe('sent')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(completed).toEqual(['sent'])
    })

    it('preserves the original webhook error when failed receipt persistence also fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const store = {
        findLatest: vi.fn(),
        findByContent: vi.fn(),
        reserve: vi.fn().mockResolvedValue(true),
        completeReservation: vi.fn(async (_reservationId, receipt) => {
          if (receipt.status === 'failed') {
            throw new Error('receipt store unavailable')
          }
          return true
        }),
        save: vi.fn(),
      }
      const notifier = createNotifier({ deliveryReceiptStore: store })

      await expect(notifier.send({ type: 'status' }, { idempotencyKey: 'status:failed-save' })).rejects.toThrow(
        'Webhook delivery failed: 503 Service Unavailable',
      )
    })

    it('redacts webhook secrets before saving failed receipt errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connect failed for https://discord.com/api/webhooks/123/secret-token'))
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const saved = vi.spyOn(store, 'save')
      const notifier = createNotifier({
        url: 'https://discord.com/api/webhooks/123/secret-token',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        deliveryReceiptStore: store,
      })

      await expect(notifier.send({ type: 'status' }, { idempotencyKey: 'status:redacted-error' })).rejects.toThrow(
        'secret-token',
      )

      const failedReceipt = saved.mock.calls.find(call => call[0].status === 'failed')?.[0]
      expect(failedReceipt?.error).toContain('[REDACTED]')
      expect(failedReceipt?.error).not.toContain('secret-token')
    })

    it('sanitizes the webhook URL before using it as the default receipt target', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const notifier = createNotifier({
        url: 'https://discord.com/api/webhooks/123/secret-token?wait=true',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        deliveryReceiptStore: store,
      })

      const receipt = await notifier.send({ type: 'status' }, { idempotencyKey: 'status:redacted-target' })

      expect(receipt.target).toMatch(/^https:\/\/discord\.com\/(?:\[REDACTED\]\/){3}\[REDACTED\]#[a-f0-9]{12}$/)
      expect(receipt.target).not.toContain('secret-token')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('keeps default receipt targets unique when redacted webhook URLs have the same shape', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const firstNotifier = createNotifier({
        url: 'https://discord.com/api/webhooks/123/secret-token-a',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        deliveryReceiptStore: store,
      })
      const secondNotifier = createNotifier({
        url: 'https://discord.com/api/webhooks/456/secret-token-b',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        deliveryReceiptStore: store,
      })
      const payload = { type: 'status', runId: 'same-payload' }

      const firstReceipt = await firstNotifier.send(payload, { idempotencyKey: 'status:same-payload' })
      const secondReceipt = await secondNotifier.send(payload, { idempotencyKey: 'status:same-payload' })

      expect(firstReceipt.target).not.toBe(secondReceipt.target)
      expect(firstReceipt.target).not.toContain('secret-token-a')
      expect(secondReceipt.target).not.toContain('secret-token-b')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('sends the same idempotency key and content when the target changes', async () => {
      const store = new InMemoryWebhookDeliveryReceiptStore()
      const notifier = createNotifier({ deliveryReceiptStore: store })
      const payload = { type: 'status', runId: 'run-2', state: 'green' }

      const discordReceipt = await notifier.send(payload, {
        idempotencyKey: 'status:run-2',
        target: 'discord:ops',
      })
      const slackReceipt = await notifier.send(payload, {
        idempotencyKey: 'status:run-2',
        target: 'slack:ops',
      })

      expect(discordReceipt).toMatchObject({ status: 'sent', target: 'discord:ops' })
      expect(slackReceipt).toMatchObject({ status: 'sent', target: 'slack:ops' })
      expect(slackReceipt.contentHash).toBe(discordReceipt.contentHash)
      expect(mockFetch).toHaveBeenCalledTimes(2)
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

    it('does not wait for stalled stream cancellation after the body-read deadline', async () => {
      const cancel = vi.fn(() => new Promise<void>(() => undefined))
      const stream = new ReadableStream<Uint8Array>({ cancel })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: stream,
      })
      const notifier = createNotifier({ deliveryTimeoutMs: 1_000 })
      const startedAt = Date.now()

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 500 Internal Server Error',
      )
      expect(Date.now() - startedAt).toBeLessThan(750)
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('keeps the delivery deadline active while reading an error body', async () => {
      const cancel = vi.fn()
      const stream = new ReadableStream<Uint8Array>({ cancel })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: stream,
      })
      const notifier = createNotifier({ deliveryTimeoutMs: 10 })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery timed out after 10ms',
      )
      expect(cancel).toHaveBeenCalled()
    })

    it('cancels a stalled error-body read when the caller aborts', async () => {
      const controller = new AbortController()
      const pull = vi.fn()
      const cancel = vi.fn()
      const stream = new ReadableStream<Uint8Array>({ pull, cancel })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: stream,
      })
      const notifier = createNotifier({ deliveryTimeoutMs: 1_000 })
      const delivery = notifier.send({ type: 'test' }, { signal: controller.signal })
      await vi.waitFor(() => expect(pull).toHaveBeenCalled())

      controller.abort(new Error('cancelled during response body'))

      await expect(delivery).rejects.toThrow('cancelled during response body')
      expect(cancel).toHaveBeenCalled()
    })

    it('passes a delivery deadline signal to fetch', async () => {
      const notifier = createNotifier()

      await notifier.send({ type: 'test' })

      const [, init] = mockFetch.mock.calls[0]
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('cleans up the delivery timeout after delivery', async () => {
      let receivedSignal: AbortSignal | undefined
      mockFetch.mockImplementation(async (_url, init) => {
        receivedSignal = init?.signal
        return { ok: true, status: 200, statusText: 'OK' }
      })
      const notifier = createNotifier({ deliveryTimeoutMs: 10 })

      await notifier.send({ type: 'test' })
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(receivedSignal?.aborted).toBe(false)
    })

    it('cleans up caller-signal listeners after delivery', async () => {
      const controller = new AbortController()
      const addSpy = vi.spyOn(controller.signal, 'addEventListener')
      const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
      const notifier = createNotifier()

      await notifier.send({ type: 'test' }, { signal: controller.signal })

      const abortListeners = addSpy.mock.calls
        .filter(([type]) => type === 'abort')
        .map(([, listener]) => listener)
      expect(abortListeners.length).toBeGreaterThan(0)
      for (const listener of abortListeners) {
        expect(removeSpy).toHaveBeenCalledWith('abort', listener)
      }
    })

    it('aborts and rejects a hung delivery after the configured timeout', async () => {
      let receivedSignal: AbortSignal | undefined
      mockFetch.mockImplementation((_url, init) => {
        receivedSignal = init?.signal
        return new Promise(() => undefined)
      })
      const notifier = createNotifier({ deliveryTimeoutMs: 10 })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery timed out after 10ms',
      )
      expect(receivedSignal?.aborted).toBe(true)
    })

    it('retries a timed-out delivery with a fresh signal', async () => {
      const signals: AbortSignal[] = []
      mockFetch
        .mockImplementationOnce((_url, init) => {
          signals.push(init?.signal as AbortSignal)
          return new Promise(() => undefined)
        })
        .mockImplementationOnce(async (_url, init) => {
          signals.push(init?.signal as AbortSignal)
          return { ok: true, status: 200, statusText: 'OK' }
        })
      const notifier = createNotifier({
        deliveryTimeoutMs: 10,
        retry: { maxRetries: 1, jitter: false },
        sleep: vi.fn().mockResolvedValue(undefined),
      })

      await expect(notifier.send({ type: 'test' })).resolves.toMatchObject({ status: 'sent' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(signals[0]?.aborted).toBe(true)
      expect(signals[1]?.aborted).toBe(false)
      expect(signals[1]).not.toBe(signals[0])
    })

    it('honours caller cancellation without retrying', async () => {
      const controller = new AbortController()
      let receivedSignal: AbortSignal | undefined
      mockFetch.mockImplementation((_url, init) => {
        receivedSignal = init?.signal
        return new Promise(() => undefined)
      })
      const notifier = createNotifier({
        deliveryTimeoutMs: 1_000,
        retry: { maxRetries: 2 },
        sleep: vi.fn().mockResolvedValue(undefined),
      })
      const delivery = notifier.send({ type: 'test' }, { signal: controller.signal })
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      controller.abort(new Error('delivery cancelled'))

      await expect(delivery).rejects.toThrow('delivery cancelled')
      expect(receivedSignal?.aborted).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('rejects a pre-cancelled delivery before starting fetch', async () => {
      const controller = new AbortController()
      controller.abort(new Error('already cancelled'))
      const notifier = createNotifier({ retry: { maxRetries: 2 } })

      await expect(notifier.send({ type: 'test' }, { signal: controller.signal })).rejects.toThrow(
        'already cancelled',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('stops a retry while waiting in backoff after caller cancellation', async () => {
      const controller = new AbortController()
      let resolveSleep!: () => void
      const sleep = vi.fn(() => new Promise<void>(resolve => { resolveSleep = resolve }))
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'))
      const notifier = createNotifier({
        retry: { maxRetries: 1, jitter: false },
        sleep,
      })
      let settled: 'cancelled' | 'resolved' | undefined
      const delivery = notifier.send({ type: 'test' }, { signal: controller.signal })
        .then(() => { settled = 'resolved' }, error => {
          if ((error as Error).message === 'cancelled during backoff') settled = 'cancelled'
        })
      await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(1))

      controller.abort(new Error('cancelled during backoff'))
      await vi.waitFor(() => expect(settled).toBe('cancelled'))

      expect(mockFetch).toHaveBeenCalledTimes(1)
      resolveSleep()
      await delivery
    })

    it('clears the default backoff timer after caller cancellation', async () => {
      const controller = new AbortController()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'))
      const notifier = createNotifier({
        retry: {
          maxRetries: 1,
          baseDelayMs: 30_000,
          maxDelayMs: 30_000,
          jitter: false,
        },
      })
      const delivery = notifier.send({ type: 'test' }, { signal: controller.signal })
      await vi.waitFor(() => {
        expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 30_000)).toBe(true)
      })
      const backoffCallIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 30_000)
      const backoffTimer = setTimeoutSpy.mock.results[backoffCallIndex]?.value

      controller.abort(new Error('cancelled during default backoff'))

      await expect(delivery).rejects.toThrow('cancelled during default backoff')
      expect(clearTimeoutSpy).toHaveBeenCalledWith(backoffTimer)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('stops a stalled DNS lookup after caller cancellation without starting HTTPS', async () => {
      const controller = new AbortController()
      let resolveDns!: (addresses: string[]) => void
      const dnsLookup = vi.fn(() => new Promise<string[]>(resolve => { resolveDns = resolve }))
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
      })
      let settled: 'cancelled' | 'resolved' | undefined
      const delivery = notifier.send({ type: 'test' }, { signal: controller.signal })
        .then(() => { settled = 'resolved' }, error => {
          if ((error as Error).message === 'cancelled during DNS') settled = 'cancelled'
        })
      await vi.waitFor(() => expect(dnsLookup).toHaveBeenCalledTimes(1))

      controller.abort(new Error('cancelled during DNS'))
      await vi.waitFor(() => expect(settled).toBe('cancelled'))

      expect(httpsRequest).not.toHaveBeenCalled()
      resolveDns(['203.0.113.10'])
      await delivery
    })

    it('times out a stalled DNS lookup before starting HTTPS', async () => {
      const dnsLookup = vi.fn(() => new Promise<string[]>(() => undefined))
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
        deliveryTimeoutMs: 10,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery timed out after 10ms',
      )
      expect(httpsRequest).not.toHaveBeenCalled()
    })

    it('retries a DNS lookup that exceeds the per-attempt delivery deadline', async () => {
      mockPinnedHttpsResponse()
      const dnsLookup = vi.fn()
        .mockImplementationOnce(() => new Promise<string[]>(() => undefined))
        .mockResolvedValueOnce(['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
        deliveryTimeoutMs: 10,
        retry: { maxRetries: 1, jitter: false },
        sleep: vi.fn().mockResolvedValue(undefined),
      })

      await expect(notifier.send({ type: 'test' })).resolves.toMatchObject({ status: 'sent' })
      expect(dnsLookup).toHaveBeenCalledTimes(2)
      expect(httpsRequest).toHaveBeenCalledTimes(1)
    })

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
      'rejects invalid deliveryTimeoutMs value %s',
      deliveryTimeoutMs => {
        expect(() => createNotifier({ deliveryTimeoutMs })).toThrow(
          'deliveryTimeoutMs must be a finite positive number no greater than 2147483647',
        )
      },
    )

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

    it('allows Discord webhook targets that match an allowed provider path', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://discord.com/api/webhooks/123456/secret-token',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        fetch: mockFetch,
      })

      await notifier.send({ type: 'test' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0][0]).toBe('https://discord.com/api/webhooks/123456/secret-token')
    })

    it('rejects malformed webhook URLs during configuration load', () => {
      expect(() => new WebhookNotifier({
        url: 'not a url',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url must be an absolute URL')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects localhost and private network webhook targets during configuration load', () => {
      expect(() => new WebhookNotifier({
        url: 'https://localhost/api/webhooks/123/secret',
        allowedTargets: ['https://localhost/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host localhost is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://localhost./api/webhooks/123/secret',
        allowedTargets: ['https://localhost./api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host localhost is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://[::1]/api/webhooks/123/secret',
        allowedTargets: ['https://[::1]/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host ::1 is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://[::ffff:192.168.1.10]/api/webhooks/123/secret',
        allowedTargets: ['https://[::ffff:192.168.1.10]/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host ::ffff:c0a8:10a is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://[fe90::1]/api/webhooks/123/secret',
        allowedTargets: ['https://[fe90::1]/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host fe90::1 is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://[fec0::1]/api/webhooks/123/secret',
        allowedTargets: ['https://[fec0::1]/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host fec0::1 is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://192.168.1.10/api/webhooks/123/secret',
        allowedTargets: ['https://192.168.1.10/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host 192.168.1.10 is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://100.64.0.1/api/webhooks/123/secret',
        allowedTargets: ['https://100.64.0.1/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host 100.64.0.1 is not allowed')
      expect(() => new WebhookNotifier({
        url: 'https://224.0.0.1/api/webhooks/123/secret',
        allowedTargets: ['https://224.0.0.1/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url host 224.0.0.1 is not allowed')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not treat public IPv6 addresses with ffff tail hextets as IPv4-mapped', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://[2001:4860::ffff:c0a8:10a]/api/webhooks/123/secret',
        allowedTargets: ['https://[2001:4860::ffff:c0a8:10a]/api/webhooks/'],
        fetch: mockFetch,
      })

      await notifier.send({ type: 'test' })

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('denies webhook targets outside configured path prefixes before sending', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://discord.com/api/oauth2/authorize',
        allowedTargets: [{ origin: 'https://discord.com', pathnamePrefix: '/api/webhooks/' }],
        fetch: mockFetch,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook target origin https://discord.com is not allowed',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects private-host webhook aliases during configuration load', () => {
      const unsafeUrls = [
        'https://127.0.0.1.nip.io/api/webhooks/123/secret',
        'https://lvh.me/api/webhooks/123/secret',
        'https://foo.lvh.me/api/webhooks/123/secret',
        'https://metadata.google.internal/computeMetadata/v1',
      ]

      for (const url of unsafeUrls) {
        expect(() => new WebhookNotifier({
          url,
          allowedTargets: [url],
          fetch: mockFetch,
        })).toThrow(/host .* is not allowed/u)
      }
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects encoded path traversal before sending', () => {
      expect(() => new WebhookNotifier({
        url: 'https://discord.com/api/webhooks/%2e%2e%2fadmin',
        allowedTargets: ['https://discord.com/api/webhooks/'],
        fetch: mockFetch,
      })).toThrow('url pathname must not include encoded dot segments or separators')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects query strings in string-form allowed targets', () => {
      expect(() => new WebhookNotifier({
        url: 'https://example.com/api/webhooks/123?token=other',
        allowedTargets: ['https://example.com/api/webhooks/123?token=secret'],
        fetch: mockFetch,
      })).toThrow('allowedTargets[0] must not include a query or fragment')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('resolves hostnames and rejects private resolved addresses before sending', async () => {
      const dnsLookup = vi.fn(async () => ['169.254.169.254'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        fetch: mockFetch,
        dnsLookup,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'resolved webhook address host 169.254.169.254 is not allowed',
      )
      expect(dnsLookup).toHaveBeenCalledWith('webhooks.example.com')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('fails closed when custom fetches opt into DNS validation because they cannot pin the connection address', async () => {
      const dnsLookup = vi.fn(async () => ['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com:8443/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com:8443/api/webhooks/'],
        fetch: mockFetch,
        dnsLookup,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Injected fetch cannot safely pin DNS-validated webhook addresses',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('aborts a stalled default pinned HTTPS request at the delivery deadline', async () => {
      const request = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>
        end: ReturnType<typeof vi.fn>
        destroy: ReturnType<typeof vi.fn>
      }
      request.write = vi.fn()
      request.end = vi.fn()
      request.destroy = vi.fn()
      vi.mocked(httpsRequest).mockReturnValue(request as never)
      const dnsLookup = vi.fn(async () => ['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
        deliveryTimeoutMs: 10,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery timed out after 10ms',
      )
      expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'WebhookDeliveryTimeoutError',
      }))
    })

    it('removes the deadline abort listener after a pinned HTTPS response', async () => {
      mockPinnedHttpsResponse()
      const removeEventListener = vi.spyOn(AbortSignal.prototype, 'removeEventListener')
      const dnsLookup = vi.fn(async () => ['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
      })

      await notifier.send({ type: 'test' })

      expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
    })

    it('preserves response bodies from the default pinned HTTPS transport', async () => {
      mockPinnedHttpsResponse(500, 'Internal Server Error', ['provider diagnostic'])
      const dnsLookup = vi.fn(async () => ['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 500 Internal Server Error for https://webhooks.example.com/[REDACTED]/[REDACTED]/[REDACTED]/[REDACTED]: provider diagnostic',
      )
    })

    it('stops waiting on stalled async-iterable response bodies from the default pinned HTTPS transport', async () => {
      const request = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      request.write = vi.fn()
      request.end = vi.fn(() => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number
          statusMessage: string
          [Symbol.asyncIterator]: () => AsyncIterator<Buffer>
          destroyed?: boolean
          destroy: ReturnType<typeof vi.fn>
        }
        response.statusCode = 500
        response.statusMessage = 'Internal Server Error'
        response.destroy = vi.fn(() => { response.destroyed = true })
        response[Symbol.asyncIterator] = async function * () {
          yield Buffer.from('partial diagnostic')
          await new Promise(() => undefined)
        }
        const callback = vi.mocked(httpsRequest).mock.calls.at(-1)?.[1]
        callback?.(response as never)
      })
      vi.mocked(httpsRequest).mockReturnValue(request as never)
      const dnsLookup = vi.fn(async () => ['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
      })
      const startedAt = Date.now()

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook delivery failed: 500 Internal Server Error for https://webhooks.example.com/[REDACTED]/[REDACTED]/[REDACTED]/[REDACTED]: partial diagnostic',
      )
      expect(Date.now() - startedAt).toBeLessThan(750)
    })

    it('tries later validated DNS addresses when the first pinned address fails', async () => {
      const firstRequest = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
      firstRequest.write = vi.fn()
      firstRequest.end = vi.fn(() => firstRequest.emit('error', new Error('ECONNREFUSED')))
      const secondRequest = mockPinnedHttpsResponse()
      vi.mocked(httpsRequest)
        .mockReturnValueOnce(firstRequest as never)
        .mockReturnValueOnce(secondRequest as never)
      const dnsLookup = vi.fn(async () => ['203.0.113.10', '203.0.113.11'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
      })

      await notifier.send({ type: 'test' })

      expect(httpsRequest).toHaveBeenCalledTimes(2)
      expect(vi.mocked(httpsRequest).mock.calls[0][0]).toEqual(expect.objectContaining({ hostname: '203.0.113.10' }))
      expect(vi.mocked(httpsRequest).mock.calls[1][0]).toEqual(expect.objectContaining({ hostname: '203.0.113.11' }))
    })

    it('pins the DNS-validated address for default HTTPS delivery', async () => {
      const request = mockPinnedHttpsResponse()
      const dnsLookup = vi.fn(async () => ['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com:8443/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com:8443/api/webhooks/'],
        dnsLookup,
      })

      await notifier.send({ type: 'test' })

      expect(httpsRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: '203.0.113.10',
          port: '8443',
          path: '/api/webhooks/123/secret',
          method: 'POST',
          servername: 'webhooks.example.com',
          headers: expect.objectContaining({
            Host: 'webhooks.example.com:8443',
            'Content-Length': Buffer.byteLength(JSON.stringify({ type: 'test' })),
          }),
        }),
        expect.any(Function),
      )
      expect(request.write).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }))
      expect(request.end).toHaveBeenCalledTimes(1)
    })

    it('retries transient DNS validation failures before delivery', async () => {
      mockPinnedHttpsResponse()
      const transientDnsError = Object.assign(new Error('temporary DNS failure'), { code: 'EAI_AGAIN' })
      const dnsLookup = vi.fn()
        .mockRejectedValueOnce(transientDnsError)
        .mockResolvedValueOnce(['203.0.113.10'])
      const notifier = new WebhookNotifier({
        url: 'https://webhooks.example.com/api/webhooks/123/secret',
        allowedTargets: ['https://webhooks.example.com/api/webhooks/'],
        dnsLookup,
        retry: { maxRetries: 1, jitter: false },
        sleep: vi.fn().mockResolvedValue(undefined),
      })

      await notifier.send({ type: 'test' })

      expect(dnsLookup).toHaveBeenCalledTimes(2)
      expect(httpsRequest).toHaveBeenCalledTimes(1)
    })

    it('enforces path-prefix boundaries before sending', async () => {
      const notifier = new WebhookNotifier({
        url: 'https://discord.com/api/webhooks-anything',
        allowedTargets: [{ origin: 'https://discord.com', pathnamePrefix: '/api/webhooks' }],
        fetch: mockFetch,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'Webhook target origin https://discord.com is not allowed',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects object-form allowed target origins that include paths', () => {
      expect(() => new WebhookNotifier({
        url: 'https://discord.com/api/webhooks/123/secret',
        allowedTargets: [{ origin: 'https://discord.com/api/webhooks/' }],
        fetch: mockFetch,
      })).toThrow('allowedTargets[0].origin must not include a path, query, or fragment')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects credentials in object-form allowed target origins', () => {
      expect(() => new WebhookNotifier({
        url: 'https://evil.example/api/webhooks/123/secret',
        allowedTargets: [{ origin: 'https://reviewed.example@evil.example' }],
        fetch: mockFetch,
      })).toThrow('allowedTargets[0].origin must not include credentials')
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

    it('revalidates DNS before each retry attempt', async () => {
      mockPinnedHttpsResponse(503, 'Service Unavailable')
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const dnsLookup = vi.fn()
        .mockResolvedValueOnce(['203.0.113.10'])
        .mockResolvedValueOnce(['169.254.169.254'])
      const notifier = new WebhookNotifier({
        url: 'https://hooks.example.com/signal',
        allowedTargetOrigins,
        dnsLookup,
        retry: { maxRetries: 1 },
        sleep: sleepFn,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow(
        'resolved webhook address host 169.254.169.254 is not allowed',
      )
      expect(dnsLookup).toHaveBeenCalledTimes(2)
      expect(httpsRequest).toHaveBeenCalledTimes(1)
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

    it('does not retry non-transient 4xx responses when body collection times out', async () => {
      const stream = new ReadableStream<Uint8Array>({
        cancel: vi.fn(),
      })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: stream,
      })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        deliveryTimeoutMs: 10,
        retry: { maxRetries: 2 },
        sleep: sleepFn,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow('401 Unauthorized')

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

    it('rejects unsafe integer maxRetries during retry configuration validation', () => {
      expect(
        () =>
          createNotifier({
            retry: { maxRetries: Number.MAX_SAFE_INTEGER + 1 },
          }),
      ).toThrow('retry.maxRetries must be a non-negative safe integer')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects invalid retry delay bounds during retry configuration validation', () => {
      const invalidOptions = [
        { retry: { maxRetries: 1, baseDelayMs: -1 } },
        { retry: { maxRetries: 1, baseDelayMs: Number.NaN } },
        { retry: { maxRetries: 1, baseDelayMs: Number.POSITIVE_INFINITY } },
        { retry: { maxRetries: 1, maxDelayMs: -1 } },
        { retry: { maxRetries: 1, maxDelayMs: Number.NaN } },
        { retry: { maxRetries: 1, maxDelayMs: Number.POSITIVE_INFINITY } },
      ]

      for (const options of invalidOptions) {
        expect(() => createNotifier(options)).toThrow(/retry\.(baseDelayMs|maxDelayMs) must be a finite non-negative number/)
      }
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('passes only finite non-negative bounded delays to sleepFn', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const sleepFn = vi.fn().mockResolvedValue(undefined)
      const notifier = createNotifier({
        retry: { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 150, jitter: true },
        sleep: sleepFn,
      })

      await expect(notifier.send({ type: 'test' })).rejects.toThrow()

      for (const [delay] of sleepFn.mock.calls) {
        expect(Number.isFinite(delay)).toBe(true)
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(delay).toBeLessThanOrEqual(150)
      }
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
