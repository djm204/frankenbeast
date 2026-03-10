import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TraceContext } from '../../core/TraceContext.js'
import { SpanLifecycle } from '../../core/SpanLifecycle.js'
import { TempoAdapter } from './TempoAdapter.js'

function makeTrace() {
  const trace = TraceContext.createTrace('research task')
  const span = TraceContext.startSpan(trace, { name: 'search' })
  SpanLifecycle.recordTokenUsage(span, { promptTokens: 200, completionTokens: 80, model: 'claude-sonnet-4-6' })
  TraceContext.endSpan(span)
  TraceContext.endTrace(trace)
  return trace
}

describe('TempoAdapter', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
  })

  describe('flush() — endpoint and path', () => {
    it('POSTs to the configured endpoint + default /v1/traces path', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await adapter.flush(makeTrace())
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:4318/v1/traces')
    })

    it('supports a custom otlpPath', async () => {
      const adapter = new TempoAdapter({
        endpoint: 'https://tempo-us-central1.grafana.net/tempo',
        otlpPath: '/otlp/v1/traces',
        fetch: mockFetch as any,
      })
      await adapter.flush(makeTrace())
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://tempo-us-central1.grafana.net/tempo/otlp/v1/traces')
    })

    it('strips a trailing slash from endpoint before appending path', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318/', fetch: mockFetch as any })
      await adapter.flush(makeTrace())
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:4318/v1/traces')
    })

    it('uses HTTP POST method', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      expect(init.method).toBe('POST')
    })
  })

  describe('flush() — headers', () => {
    it('sends Content-Type: application/json', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers['Content-Type']).toBe('application/json')
    })

    it('sends Basic Authorization header when basicAuth is provided', async () => {
      const adapter = new TempoAdapter({
        endpoint: 'https://tempo-us-central1.grafana.net/tempo',
        basicAuth: { user: '123456', password: 'glc_mytoken' },
        fetch: mockFetch as any,
      })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      const expected = `Basic ${Buffer.from('123456:glc_mytoken').toString('base64')}`
      expect(init.headers['Authorization']).toBe(expected)
    })

    it('omits Authorization header when basicAuth is not provided', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      expect(init.headers).not.toHaveProperty('Authorization')
    })
  })

  describe('flush() — body', () => {
    it('sends a JSON body with a resourceSpans array', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await adapter.flush(makeTrace())
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body).toHaveProperty('resourceSpans')
      expect(Array.isArray(body.resourceSpans)).toBe(true)
    })

    it('body includes the trace goal in resource attributes', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      const trace = makeTrace()
      await adapter.flush(trace)
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      const resourceAttrs = body.resourceSpans[0].resource.attributes as Array<{
        key: string
        value: { stringValue?: string }
      }>
      const goalAttr = resourceAttrs.find(a => a.key === 'frankenbeast.trace.goal')
      expect(goalAttr?.value.stringValue).toBe('research task')
    })

    it('body includes the trace id in resource attributes', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      const trace = makeTrace()
      await adapter.flush(trace)
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body as string)
      const resourceAttrs = body.resourceSpans[0].resource.attributes as Array<{
        key: string
        value: { stringValue?: string }
      }>
      const idAttr = resourceAttrs.find(a => a.key === 'frankenbeast.trace.id')
      expect(idAttr?.value.stringValue).toBe(trace.id)
    })
  })

  describe('flush() — error handling', () => {
    it('throws if the HTTP response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' })
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await expect(adapter.flush(makeTrace())).rejects.toThrow('401')
    })

    it('error message includes the status code', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      await expect(adapter.flush(makeTrace())).rejects.toThrow('503')
    })
  })

  describe('ExportAdapter contract — write-only', () => {
    it('queryByTraceId() returns null', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      expect(await adapter.queryByTraceId('any-id')).toBeNull()
    })

    it('listTraceIds() returns []', async () => {
      const adapter = new TempoAdapter({ endpoint: 'http://localhost:4318', fetch: mockFetch as any })
      expect(await adapter.listTraceIds()).toEqual([])
    })
  })

  describe('Grafana Cloud integration pattern', () => {
    it('constructs correct URL and auth for a typical Grafana Cloud Tempo setup', async () => {
      const adapter = new TempoAdapter({
        endpoint: 'https://tempo-us-central1.grafana.net/tempo',
        otlpPath: '/otlp/v1/traces',
        basicAuth: { user: '987654', password: 'glc_secret_token' },
        fetch: mockFetch as any,
      })
      await adapter.flush(makeTrace())
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://tempo-us-central1.grafana.net/tempo/otlp/v1/traces')
      const expected = `Basic ${Buffer.from('987654:glc_secret_token').toString('base64')}`
      expect(init.headers['Authorization']).toBe(expected)
    })
  })
})
