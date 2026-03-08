import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TraceContext } from '../../core/TraceContext.js'
import { SpanLifecycle } from '../../core/SpanLifecycle.js'
import { LangfuseAdapter } from './LangfuseAdapter.js'

function makeTrace() {
  const trace = TraceContext.createTrace('test goal')
  const span = TraceContext.startSpan(trace, { name: 'step-1' })
  SpanLifecycle.recordTokenUsage(span, { promptTokens: 100, completionTokens: 50, model: 'claude-sonnet-4-6' })
  TraceContext.endSpan(span)
  TraceContext.endTrace(trace)
  return trace
}

describe('LangfuseAdapter', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
  })

  describe('flush()', () => {
    it('POSTs to the Langfuse OTEL endpoint', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      await adapter.flush(makeTrace())
      expect(mockFetch).toHaveBeenCalledOnce()
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/api/public/otel/v1/traces')
    })

    it('defaults baseUrl to https://cloud.langfuse.com', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      await adapter.flush(makeTrace())
      const [url] = mockFetch.mock.calls[0]
      expect(url).toMatch(/^https:\/\/cloud\.langfuse\.com/)
    })

    it('uses a custom baseUrl when provided', async () => {
      const adapter = new LangfuseAdapter({
        baseUrl: 'https://eu.cloud.langfuse.com',
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        fetch: mockFetch,
      })
      await adapter.flush(makeTrace())
      const [url] = mockFetch.mock.calls[0]
      expect(url).toMatch(/^https:\/\/eu\.cloud\.langfuse\.com/)
    })

    it('sends a Basic Authorization header using publicKey:secretKey', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-abc', secretKey: 'sk-xyz', fetch: mockFetch })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      const expected = `Basic ${Buffer.from('pk-abc:sk-xyz').toString('base64')}`
      expect(init.headers['Authorization']).toBe(expected)
    })

    it('sends Content-Type: application/json', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/json')
    })

    it('sends a JSON body with a resourceSpans array', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body).toHaveProperty('resourceSpans')
      expect(Array.isArray(body.resourceSpans)).toBe(true)
    })

    it('body contains the trace id in resource attributes', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      const trace = makeTrace()
      await adapter.flush(trace)
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      const resourceAttrs = body.resourceSpans[0].resource.attributes as Array<{ key: string; value: { stringValue?: string } }>
      const idAttr = resourceAttrs.find(a => a.key === 'frankenbeast.trace.id')
      expect(idAttr?.value.stringValue).toBe(trace.id)
    })

    it('throws if the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })
      const adapter = new LangfuseAdapter({ publicKey: 'bad', secretKey: 'bad', fetch: mockFetch })
      await expect(adapter.flush(makeTrace())).rejects.toThrow('401')
    })

    it('uses HTTP POST method', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      expect(init.method).toBe('POST')
    })
  })

  describe('ExportAdapter contract — write-only', () => {
    it('queryByTraceId() returns null', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      expect(await adapter.queryByTraceId('any-id')).toBeNull()
    })

    it('listTraceIds() returns []', async () => {
      const adapter = new LangfuseAdapter({ publicKey: 'pk-test', secretKey: 'sk-test', fetch: mockFetch })
      expect(await adapter.listTraceIds()).toEqual([])
    })
  })
})
