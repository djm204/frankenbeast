import { describe, it, expect } from 'vitest'
import { SpanRedactor } from './SpanRedactor.js'
import { InMemoryAdapter } from '../export/InMemoryAdapter.js'
import type { Trace, Span } from '../core/types.js'
import type { ExportAdapter } from '../export/ExportAdapter.js'

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

class MutatingAdapter implements ExportAdapter {
  lastTrace: Trace | null = null

  async flush(trace: Trace): Promise<void> {
    this.lastTrace = trace
    const span = trace.spans[0]
    span.metadata.downstream = 'mutated'
    span.thoughtBlocks.push('downstream thought')
  }

  async queryByTraceId(): Promise<Trace | null> {
    return this.lastTrace
  }

  async listTraceIds(): Promise<string[]> {
    return this.lastTrace ? [this.lastTrace.id] : []
  }
}

// ── metadata key redaction ────────────────────────────────────────────────────

describe('SpanRedactor — metadata rules', () => {
  it('removes a metadata key matching an exact string rule', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'api_key', action: 'remove' }],
    })
    const span = makeSpan({ metadata: { api_key: 'test-api-key-value', model: 'gpt-4' } })
    await redactor.flush(makeTrace([span]))
    const stored = await inner.queryByTraceId('trace-1')
    expect(stored!.spans[0].metadata).not.toHaveProperty('api_key')
    expect(stored!.spans[0].metadata['model']).toBe('gpt-4')
  })

  it('masks a metadata key with [REDACTED] by default', async () => {
    const inner = new InMemoryAdapter()
    const passwordValue = ['hun', 'ter2'].join('')
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'password', action: 'mask' }],
    })
    await redactor.flush(makeTrace([makeSpan({ metadata: { password: passwordValue } })]))
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
      rules: [{ key: 'credential', action: 'remove' }],
    })
    await redactor.flush(makeTrace([makeSpan({ metadata: { credential: 'x', safe: 'visible' } })]))
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

  it('matches global RegExp rules statelessly across consecutive keys and flushes', async () => {
    const inner = new InMemoryAdapter()
    const keyPattern = /^(api|auth)_/g
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: keyPattern, action: 'remove' }],
    })

    await redactor.flush(
      makeTrace([makeSpan({ metadata: { api_key: 'k', auth_token: 't', model: 'x' } })]),
    )
    await redactor.flush(
      makeTrace(
        [makeSpan({ id: 'span-2', metadata: { api_secret: 's', auth_cookie: 'c', safe: true } })],
        'trace-2',
      ),
    )

    const firstMeta = (await inner.queryByTraceId('trace-1'))!.spans[0].metadata
    expect(firstMeta).not.toHaveProperty('api_key')
    expect(firstMeta).not.toHaveProperty('auth_token')
    expect(firstMeta['model']).toBe('x')

    const secondMeta = (await inner.queryByTraceId('trace-2'))!.spans[0].metadata
    expect(secondMeta).not.toHaveProperty('api_secret')
    expect(secondMeta).not.toHaveProperty('auth_cookie')
    expect(secondMeta['safe']).toBe(true)
    expect(keyPattern.lastIndex).toBe(0)
  })

  it('matches sticky RegExp rules statelessly', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: /^(api|auth)_/y, action: 'mask' }],
    })

    await redactor.flush(
      makeTrace([makeSpan({ metadata: { api_key: 'k', auth_token: 't', model: 'x' } })]),
    )

    const meta = (await inner.queryByTraceId('trace-1'))!.spans[0].metadata
    expect(meta['api_key']).toBe('[REDACTED]')
    expect(meta['auth_token']).toBe('[REDACTED]')
    expect(meta['model']).toBe('x')
  })

  it('applies rules to all spans in the trace', async () => {
    const inner = new InMemoryAdapter()
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'credential', action: 'remove' }],
    })
    const spans = [
      makeSpan({ id: 's1', metadata: { credential: 'a', keep: 1 } }),
      makeSpan({ id: 's2', metadata: { credential: 'b', keep: 2 } }),
    ]
    await redactor.flush(makeTrace(spans))
    const stored = await inner.queryByTraceId('trace-1')
    for (const span of stored!.spans) {
      expect(span.metadata).not.toHaveProperty('credential')
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
      rules: [{ key: 'credential', action: 'remove' }],
    })
    const span = makeSpan({ metadata: { credential: 'keep-me', other: 'ok' } })
    const trace = makeTrace([span])
    await redactor.flush(trace)
    expect(trace.spans[0].metadata['credential']).toBe('keep-me')
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

  it('defensively clones spans before downstream export when no rules are configured', async () => {
    const inner = new MutatingAdapter()
    const span = makeSpan({ metadata: { safe: 'visible' }, thoughtBlocks: ['private'] })
    const trace = makeTrace([span])
    const redactor = new SpanRedactor({ adapter: inner, rules: [] })

    await redactor.flush(trace)

    expect(inner.lastTrace!.spans[0]).not.toBe(span)
    expect(inner.lastTrace!.spans[0].metadata).not.toBe(span.metadata)
    expect(inner.lastTrace!.spans[0].thoughtBlocks).not.toBe(span.thoughtBlocks)
    expect(trace.spans[0].metadata).toEqual({ safe: 'visible' })
    expect(trace.spans[0].thoughtBlocks).toEqual(['private'])
  })

  it('defensively clones spans before downstream export when rules do not match', async () => {
    const inner = new MutatingAdapter()
    const span = makeSpan({ metadata: { safe: 'visible' }, thoughtBlocks: ['private'] })
    const trace = makeTrace([span])
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'credential', action: 'remove' }],
    })

    await redactor.flush(trace)

    expect(inner.lastTrace!.spans[0]).not.toBe(span)
    expect(inner.lastTrace!.spans[0].metadata).not.toBe(span.metadata)
    expect(inner.lastTrace!.spans[0].thoughtBlocks).not.toBe(span.thoughtBlocks)
    expect(trace.spans[0].metadata).toEqual({ safe: 'visible' })
    expect(trace.spans[0].thoughtBlocks).toEqual(['private'])
  })

  it('defensively clones unchanged spans when another span in the trace is redacted', async () => {
    const inner = new MutatingAdapter()
    const unchanged = makeSpan({ id: 's1', metadata: { safe: 'visible' }, thoughtBlocks: ['private'] })
    const redacted = makeSpan({ id: 's2', metadata: { credential: 'secret' }, thoughtBlocks: [] })
    const trace = makeTrace([unchanged, redacted])
    const redactor = new SpanRedactor({
      adapter: inner,
      rules: [{ key: 'credential', action: 'remove' }],
    })

    await redactor.flush(trace)

    expect(inner.lastTrace!.spans[0]).not.toBe(unchanged)
    expect(inner.lastTrace!.spans[0].metadata).not.toBe(unchanged.metadata)
    expect(inner.lastTrace!.spans[0].thoughtBlocks).not.toBe(unchanged.thoughtBlocks)
    expect(trace.spans[0].metadata).toEqual({ safe: 'visible' })
    expect(trace.spans[0].thoughtBlocks).toEqual(['private'])
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
