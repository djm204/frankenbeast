import { describe, it, expect } from 'vitest'
import { SpanRedactor } from './SpanRedactor.js'
import { InMemoryAdapter } from '../export/InMemoryAdapter.js'
import type { Trace, Span } from '../core/types.js'

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: 'span-1',
    traceId: 'trace-1',
    name: 'test-span',
    status: 'completed',
    startedAt: Date.now(),
    metadata: {},
    thoughtBlocks: [],
    ...overrides,
  }
}

function makeTrace(spans: Span[] = [], id = 'trace-1'): Trace {
  return { id, goal: 'test', status: 'completed', startedAt: Date.now(), spans }
}

// ── metadata key redaction ────────────────────────────────────────────────────

describe('SpanRedactor — metadata rules', () => {
  it('removes a metadata key matching an exact string rule', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'api_key', action: 'remove' }],
    })
    const span = makeSpan({ metadata: { api_key: 'sk-secret', model: 'gpt-4' } })
    await redactor.flush(makeTrace([span]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].metadata).not.toHaveProperty('api_key')
    expect(stored!.spans[0].metadata['model']).toBe('gpt-4')
  })

  it('masks a metadata key with [REDACTED] by default', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'password', action: 'mask' }],
    })
    await redactor.flush(makeTrace([makeSpan({ metadata: { password: 'hunter2' } })]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].metadata['password']).toBe('[REDACTED]')
  })

  it('masks with a custom maskWith string', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'token', action: 'mask', maskWith: '***' }],
    })
    await redactor.flush(makeTrace([makeSpan({ metadata: { token: 'abc' } })]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].metadata['token']).toBe('***')
  })

  it('leaves non-matching keys untouched', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'secret', action: 'remove' }],
    })
    await redactor.flush(makeTrace([makeSpan({ metadata: { secret: 'x', safe: 'visible' } })]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].metadata['safe']).toBe('visible')
  })

  it('matches keys using a RegExp rule', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: /^(api|auth)_/, action: 'remove' }],
    })
    const span = makeSpan({ metadata: { api_key: 'k', auth_token: 't', model: 'x' } })
    await redactor.flush(makeTrace([span]))
    const stored = await inner.queryByTraceId('trace-1')
    const meta = stored!.spans[0].metadata
    expect(meta).not.toHaveProperty('api_key')
    expect(meta).not.toHaveProperty('auth_token')
    expect(meta['model']).toBe('x')
  })

  it('applies rules to all spans in the trace', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'secret', action: 'remove' }],
    })
    const spans = [
      makeSpan({ id: 's1', metadata: { secret: 'a', keep: 1 } }),
      makeSpan({ id: 's2', metadata: { secret: 'b', keep: 2 } }),
    ]
    await redactor.flush(makeTrace(spans))
    const stored = await inner.queryByTraceId('trace-1')
    for (const span of stored!.spans) {
      expect(span.metadata).not.toHaveProperty('secret')
    }
  })

  it('applies multiple rules in sequence', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [
        { key: 'api_key', action: 'remove' },
        { key: 'email', action: 'mask' },
      ],
    })
    const span = makeSpan({ metadata: { api_key: 'sk', email: 'user@example.com', safe: 'ok' } })
    await redactor.flush(makeTrace([span]))
    const meta = (await inner.queryByTraceId('trace-1'))!.spans[0].metadata
    expect(meta).not.toHaveProperty('api_key')
    expect(meta['email']).toBe('[REDACTED]')
    expect(meta['safe']).toBe('ok')
  })

  it('empty rules list — passes trace through unchanged', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({ adapter: inner, rules: [] })
    const span = makeSpan({ metadata: { key: 'value' } })
    await redactor.flush(makeTrace([span]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].metadata['key']).toBe('value')
  })

  it('handles spans with empty metadata without error', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'anything', action: 'remove' }],
    })
    await expect(redactor.flush(makeTrace([makeSpan({ metadata: {} })]))).resolves.toBeUndefined()
  })
})

// ── thought-block redaction ───────────────────────────────────────────────────

describe('SpanRedactor — thoughtBlocks redaction', () => {
  it('clears thoughtBlocks when redactThoughtBlocks is true', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({ adapter: inner, rules: [], redactThoughtBlocks: true })
    const span = makeSpan({ thoughtBlocks: ['thinking step 1', 'thinking step 2'] })
    await redactor.flush(makeTrace([span]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].thoughtBlocks).toEqual([])
  })

  it('preserves thoughtBlocks when redactThoughtBlocks is not set', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({ adapter: inner, rules: [] })
    const span = makeSpan({ thoughtBlocks: ['private thought'] })
    await redactor.flush(makeTrace([span]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].thoughtBlocks).toEqual(['private thought'])
  })

  it('applies thought-block redaction across all spans', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({ adapter: inner, rules: [], redactThoughtBlocks: true })
    const spans = [
      makeSpan({ id: 's1', thoughtBlocks: ['thought a'] }),
      makeSpan({ id: 's2', thoughtBlocks: ['thought b'] }),
    ]
    await redactor.flush(makeTrace(spans))
    const stored = await inner.queryByTraceId('trace-1')
    for (const span of stored!.spans) {
      expect(span.thoughtBlocks).toEqual([])
    }
  })
})

// ── immutability ──────────────────────────────────────────────────────────────

describe('SpanRedactor — immutability', () => {
  it('does not mutate the original trace', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'secret', action: 'remove' }],
    })
    const span = makeSpan({ metadata: { secret: 'keep-me', other: 'ok' } })
    const trace = makeTrace([span])
    await redactor.flush(trace)
    expect(trace.spans[0].metadata['secret']).toBe('keep-me')
  })

  it('does not mutate original thoughtBlocks', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({ adapter: inner, rules: [], redactThoughtBlocks: true })
    const thoughts = ['private']
    const span = makeSpan({ thoughtBlocks: thoughts })
    const trace = makeTrace([span])
    await redactor.flush(trace)
    expect(thoughts).toEqual(['private'])
  })
})

// ── delegation ────────────────────────────────────────────────────────────────

describe('SpanRedactor — delegation', () => {
  it('delegates queryByTraceId to the underlying adapter', async () => {
    const inner = new InMemoryAdapter()
    const trace = makeTrace([makeSpan()])
    await inner.flush(trace)
    const redactor = new SpanRedactor({ adapter: inner, rules: [] })
    expect(await redactor.queryByTraceId('trace-1')).toEqual(trace)
  })

  it('delegates listTraceIds to the underlying adapter', async () => {
    const inner = new InMemoryAdapter()
    await inner.flush(makeTrace([], 'a'))
    await inner.flush(makeTrace([], 'b'))
    const redactor = new SpanRedactor({ adapter: inner, rules: [] })
    expect((await redactor.listTraceIds()).sort()).toEqual(['a', 'b'])
  })
})
