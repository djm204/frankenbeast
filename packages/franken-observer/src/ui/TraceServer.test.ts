import { createContext, Script } from 'node:vm'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TraceServer } from './TraceServer.js'
import { InMemoryAdapter } from '../export/InMemoryAdapter.js'
import { TraceContext } from '../core/TraceContext.js'
import { SpanLifecycle } from '../core/SpanLifecycle.js'

function makeTrace(goal: string) {
  const trace = TraceContext.createTrace(goal)
  const span = TraceContext.startSpan(trace, { name: 'step-1' })
  SpanLifecycle.recordTokenUsage(span, { promptTokens: 300, completionTokens: 150, model: 'claude-sonnet-4-6' })
  TraceContext.endSpan(span)
  TraceContext.endTrace(trace)
  return trace
}

describe('TraceServer', () => {
  let adapter: InMemoryAdapter
  let server: TraceServer

  beforeEach(async () => {
    adapter = new InMemoryAdapter()
    server = new TraceServer({ adapter, port: 0 }) // port 0 = OS-assigned free port
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  describe('url getter', () => {
    it('returns an http://localhost URL after start()', () => {
      expect(server.url).toMatch(/^http:\/\/localhost:\d+$/)
    })

    it('reflects the actual bound port, not 0', () => {
      const port = parseInt(new URL(server.url).port, 10)
      expect(port).toBeGreaterThan(0)
    })
  })

  describe('GET /', () => {
    it('returns 200', async () => {
      const res = await fetch(server.url + '/')
      expect(res.status).toBe(200)
    })

    it('Content-Type is text/html', async () => {
      const res = await fetch(server.url + '/')
      expect(res.headers.get('content-type')).toContain('text/html')
    })

    it('body is non-empty HTML containing the app name', async () => {
      const html = await fetch(server.url + '/').then(r => r.text())
      expect(html).toContain('franken-observer')
      expect(html.length).toBeGreaterThan(100)
    })

    it('HTML is self-contained — no external script or link tags', async () => {
      const html = await fetch(server.url + '/').then(r => r.text())
      expect(html).not.toMatch(/<script\s+src=/i)
      expect(html).not.toMatch(/<link\s[^>]*rel=["']stylesheet["']/i)
    })

    it('escapes template-literal metacharacters in trace text before writing innerHTML', async () => {
      const html = await fetch(server.url + '/').then(r => r.text())
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
      expect(script).toBeDefined()

      const context = createContext({ document: { getElementById: () => ({ addEventListener: () => {} }) } }) as { esc?: (s: string) => string }
      new Script(script!.replace(/loadTraces\(\)\s*$/, '')).runInContext(context)

      const escaped = context.esc!('goal`);globalThis.__xss=1;//${alert(1)}<img src=x onerror=alert(2)>')
      expect(escaped).not.toContain('`')
      expect(escaped).not.toContain('${')
      expect(escaped).toContain('&lt;img src=x onerror=alert(2)&gt;')
    })

    it('escapes trace IDs when rendering sidebar and detail (XSS via t.id)', async () => {
      const html = await fetch(server.url + '/').then(r => r.text())
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
      expect(script).toBeDefined()

      const maliciousId = '"><img src=x onerror=alert(1)>'
      const sidebar = { innerHTML: '', addEventListener: () => {} }
      const panel = { innerHTML: '', addEventListener: () => {} }
      const elements: Record<string, unknown> = { sidebar, panel }

      const fetchMock = (url: string) => {
        if (url.endsWith('/api/traces')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              traces: [{ id: maliciousId, goal: 'g', status: 'completed', spanCount: 0, startedAt: Date.now() }],
            }),
          })
        }
        return Promise.resolve({
          json: () => Promise.resolve({ id: maliciousId, goal: 'g', status: 'completed', spans: [] }),
        })
      }

      const context = createContext({
        document: {
          getElementById: (id: string) => elements[id],
          querySelectorAll: () => [] as unknown[],
        },
        fetch: fetchMock,
        Date,
      }) as {
        loadTraces?: () => Promise<void>
        loadDetail?: (id: string) => Promise<void>
      }
      new Script(script!.replace(/loadTraces\(\)\s*$/, '')).runInContext(context)

      await context.loadTraces!()
      expect(sidebar.innerHTML).not.toContain('<img')
      expect(sidebar.innerHTML).toContain('&lt;img')

      await context.loadDetail!(maliciousId)
      expect(panel.innerHTML).not.toContain('<img')
      expect(panel.innerHTML).toContain('&lt;img')
    })
  })

  describe('GET /api/traces', () => {
    it('returns 200 with Content-Type application/json', async () => {
      const res = await fetch(server.url + '/api/traces')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')
    })

    it('returns { traces: [] } when no traces have been flushed', async () => {
      const { traces } = await fetch(server.url + '/api/traces').then(r => r.json()) as { traces: unknown[] }
      expect(traces).toEqual([])
    })

    it('returns summaries for flushed traces', async () => {
      const trace = makeTrace('Test goal')
      await adapter.flush(trace)
      const { traces } = await fetch(server.url + '/api/traces').then(r => r.json()) as { traces: Array<{ id: string }> }
      expect(traces).toHaveLength(1)
      expect(traces[0].id).toBe(trace.id)
    })

    it('each summary includes id, goal, status, spanCount, startedAt', async () => {
      const trace = makeTrace('Analyse data')
      await adapter.flush(trace)
      const { traces } = await fetch(server.url + '/api/traces').then(r => r.json()) as {
        traces: Array<{ id: string; goal: string; status: string; spanCount: number; startedAt: number }>
      }
      const s = traces[0]
      expect(s).toHaveProperty('id', trace.id)
      expect(s).toHaveProperty('goal', 'Analyse data')
      expect(s).toHaveProperty('status', 'completed')
      expect(s).toHaveProperty('spanCount', 1)
      expect(s).toHaveProperty('startedAt')
      expect(typeof s.startedAt).toBe('number')
    })

    it('returns summaries for multiple traces', async () => {
      await adapter.flush(makeTrace('Goal A'))
      await adapter.flush(makeTrace('Goal B'))
      const { traces } = await fetch(server.url + '/api/traces').then(r => r.json()) as { traces: unknown[] }
      expect(traces).toHaveLength(2)
    })
  })

  describe('GET /api/traces/:id', () => {
    it('returns 200 with the full trace when found', async () => {
      const trace = makeTrace('Deep research')
      await adapter.flush(trace)
      const res = await fetch(`${server.url}/api/traces/${trace.id}`)
      expect(res.status).toBe(200)
      const body = await res.json() as { id: string; goal: string }
      expect(body.id).toBe(trace.id)
      expect(body.goal).toBe('Deep research')
    })

    it('returned trace includes spans', async () => {
      const trace = makeTrace('Deep research')
      await adapter.flush(trace)
      const body = await fetch(`${server.url}/api/traces/${trace.id}`).then(r => r.json()) as {
        spans: Array<{ name: string }>
      }
      expect(Array.isArray(body.spans)).toBe(true)
      expect(body.spans).toHaveLength(1)
      expect(body.spans[0].name).toBe('step-1')
    })

    it('returns 404 JSON for an unknown trace id', async () => {
      const res = await fetch(`${server.url}/api/traces/nonexistent-id`)
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body).toHaveProperty('error')
    })

    it('decodes percent-encoded trace ids so they round-trip encodeURIComponent', async () => {
      const trace = makeTrace('Special id')
      trace.id = 'run:42@host+a&b=c;d,e'
      await adapter.flush(trace)
      const res = await fetch(`${server.url}/api/traces/${encodeURIComponent(trace.id)}`)
      expect(res.status).toBe(200)
      const body = await res.json() as { id: string }
      expect(body.id).toBe(trace.id)
    })

    it('returns 404 JSON (not 500) for malformed percent-encoding', async () => {
      const res = await fetch(`${server.url}/api/traces/%E0%A4%A`)
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body).toHaveProperty('error')
    })
  })

  describe('GET /unknown-path', () => {
    it('returns 404', async () => {
      const res = await fetch(`${server.url}/does-not-exist`)
      expect(res.status).toBe(404)
    })
  })

  describe('stop()', () => {
    it('resolves cleanly', async () => {
      const s = new TraceServer({ adapter, port: 0 })
      await s.start()
      await expect(s.stop()).resolves.toBeUndefined()
    })

    it('server refuses connections after stop()', async () => {
      const s = new TraceServer({ adapter, port: 0 })
      await s.start()
      const url = s.url
      await s.stop()
      await expect(fetch(url + '/')).rejects.toThrow()
    })
  })
})
