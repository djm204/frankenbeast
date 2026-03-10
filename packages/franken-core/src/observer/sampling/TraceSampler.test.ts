import { describe, it, expect, vi } from 'vitest'
import {
  AlwaysOnSampler,
  ProbabilisticSampler,
  RateLimitedSampler,
  SamplingAdapter,
} from './TraceSampler.js'
import { InMemoryAdapter } from '../export/InMemoryAdapter.js'
import type { Trace } from '../core/types.js'

function makeTrace(id = 'trace-1'): Trace {
  return { id, goal: 'test', status: 'completed', startedAt: Date.now(), spans: [] }
}

// ── AlwaysOnSampler ──────────────────────────────────────────────────────────

describe('AlwaysOnSampler', () => {
  it('always returns true', () => {
    const s = new AlwaysOnSampler()
    expect(s.shouldSample('abc')).toBe(true)
  })

  it('returns true for any traceId', () => {
    const s = new AlwaysOnSampler()
    for (const id of ['', 'x', '00000000-0000-0000-0000-000000000000']) {
      expect(s.shouldSample(id)).toBe(true)
    }
  })
})

// ── ProbabilisticSampler ─────────────────────────────────────────────────────

describe('ProbabilisticSampler', () => {
  it('with probability 1.0, always samples', () => {
    const s = new ProbabilisticSampler(1.0)
    for (let i = 0; i < 100; i++) expect(s.shouldSample('t')).toBe(true)
  })

  it('with probability 0.0, never samples', () => {
    const s = new ProbabilisticSampler(0.0)
    for (let i = 0; i < 100; i++) expect(s.shouldSample('t')).toBe(false)
  })

  it('samples when random value is below the probability threshold', () => {
    const s = new ProbabilisticSampler(0.5, () => 0.49)
    expect(s.shouldSample('t')).toBe(true)
  })

  it('does not sample when random value equals the probability threshold', () => {
    const s = new ProbabilisticSampler(0.5, () => 0.5)
    expect(s.shouldSample('t')).toBe(false)
  })

  it('does not sample when random value exceeds the threshold', () => {
    const s = new ProbabilisticSampler(0.5, () => 0.51)
    expect(s.shouldSample('t')).toBe(false)
  })

  it('throws RangeError for probability < 0', () => {
    expect(() => new ProbabilisticSampler(-0.1)).toThrow(RangeError)
  })

  it('throws RangeError for probability > 1', () => {
    expect(() => new ProbabilisticSampler(1.1)).toThrow(RangeError)
  })
})

// ── RateLimitedSampler ───────────────────────────────────────────────────────

describe('RateLimitedSampler', () => {
  it('samples traces up to maxPerWindow within a window', () => {
    const s = new RateLimitedSampler({ maxPerWindow: 3, windowMs: 1000, now: () => 0 })
    expect(s.shouldSample('t1')).toBe(true)
    expect(s.shouldSample('t2')).toBe(true)
    expect(s.shouldSample('t3')).toBe(true)
  })

  it('rejects traces that exceed the limit', () => {
    const s = new RateLimitedSampler({ maxPerWindow: 2, windowMs: 1000, now: () => 0 })
    s.shouldSample('t1')
    s.shouldSample('t2')
    expect(s.shouldSample('t3')).toBe(false)
  })

  it('resets the counter when the window expires', () => {
    let time = 0
    const s = new RateLimitedSampler({ maxPerWindow: 1, windowMs: 1000, now: () => time })
    expect(s.shouldSample('t1')).toBe(true)
    expect(s.shouldSample('t2')).toBe(false) // limit reached
    time = 1000 // advance past window
    expect(s.shouldSample('t3')).toBe(true)  // new window
  })

  it('samples exactly maxPerWindow and rejects the next', () => {
    const s = new RateLimitedSampler({ maxPerWindow: 5, windowMs: 500, now: () => 0 })
    const results = Array.from({ length: 6 }, (_, i) => s.shouldSample(`t${i}`))
    expect(results.slice(0, 5).every(Boolean)).toBe(true)
    expect(results[5]).toBe(false)
  })
})

// ── SamplingAdapter ──────────────────────────────────────────────────────────

describe('SamplingAdapter', () => {
  it('flushes the trace when strategy returns true', async () => {
    const inner = new InMemoryAdapter()
    const adapter = new SamplingAdapter({ strategy: new AlwaysOnSampler(), adapter: inner })
    const trace = makeTrace()
    await adapter.flush(trace)
    expect(await inner.queryByTraceId(trace.id)).toEqual(trace)
  })

  it('does NOT flush when strategy returns false', async () => {
    const inner = new InMemoryAdapter()
    const adapter = new SamplingAdapter({ strategy: new ProbabilisticSampler(0), adapter: inner })
    await adapter.flush(makeTrace('dropped'))
    expect(await inner.queryByTraceId('dropped')).toBeNull()
  })

  it('delegates queryByTraceId to the underlying adapter', async () => {
    const inner = new InMemoryAdapter()
    const trace = makeTrace()
    await inner.flush(trace)
    const adapter = new SamplingAdapter({ strategy: new AlwaysOnSampler(), adapter: inner })
    expect(await adapter.queryByTraceId(trace.id)).toEqual(trace)
  })

  it('delegates listTraceIds to the underlying adapter', async () => {
    const inner = new InMemoryAdapter()
    await inner.flush(makeTrace('a'))
    await inner.flush(makeTrace('b'))
    const adapter = new SamplingAdapter({ strategy: new AlwaysOnSampler(), adapter: inner })
    expect((await adapter.listTraceIds()).sort()).toEqual(['a', 'b'])
  })

  it('works with RateLimitedSampler — stops flushing after limit', async () => {
    const inner = new InMemoryAdapter()
    const strategy = new RateLimitedSampler({ maxPerWindow: 2, windowMs: 1000, now: () => 0 })
    const adapter = new SamplingAdapter({ strategy, adapter: inner })
    await adapter.flush(makeTrace('t1'))
    await adapter.flush(makeTrace('t2'))
    await adapter.flush(makeTrace('t3')) // dropped
    const ids = await inner.listTraceIds()
    expect(ids.sort()).toEqual(['t1', 't2'])
    expect(ids).not.toContain('t3')
  })

  it('passes the traceId to the strategy for shouldSample', async () => {
    const mockStrategy = { shouldSample: vi.fn().mockReturnValue(true) }
    const inner = new InMemoryAdapter()
    const adapter = new SamplingAdapter({ strategy: mockStrategy, adapter: inner })
    const trace = makeTrace('my-trace-id')
    await adapter.flush(trace)
    expect(mockStrategy.shouldSample).toHaveBeenCalledWith('my-trace-id')
  })
})
