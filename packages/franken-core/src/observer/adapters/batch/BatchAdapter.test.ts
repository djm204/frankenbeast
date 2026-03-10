import { describe, it, expect, vi } from 'vitest'
import { BatchAdapter } from './BatchAdapter.js'
import { InMemoryAdapter } from '../../export/InMemoryAdapter.js'
import type { Trace } from '../../core/types.js'

function makeTrace(id: string): Trace {
  return { id, goal: 'test', status: 'completed', startedAt: Date.now(), spans: [] }
}

// ── buffering ─────────────────────────────────────────────────────────────────

describe('BatchAdapter — buffering', () => {
  it('does not immediately forward traces to the inner adapter', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 5 })
    await batch.flush(makeTrace('t1'))
    expect(await inner.listTraceIds()).toEqual([])
  })

  it('auto-drains when the buffer reaches maxBatchSize', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 3 })
    await batch.flush(makeTrace('t1'))
    await batch.flush(makeTrace('t2'))
    expect(await inner.listTraceIds()).toEqual([])
    await batch.flush(makeTrace('t3')) // hits maxBatchSize → drain
    expect((await inner.listTraceIds()).sort()).toEqual(['t1', 't2', 't3'])
  })

  it('clears the buffer after an auto-drain', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 2 })
    await batch.flush(makeTrace('t1'))
    await batch.flush(makeTrace('t2')) // drain
    await batch.flush(makeTrace('t3')) // starts a new buffer
    // t3 is not yet in inner — still buffered
    expect(await inner.queryByTraceId('t3')).toBeNull()
  })

  it('forwards all traces in the batch to the inner adapter', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 2 })
    const t1 = makeTrace('t1')
    const t2 = makeTrace('t2')
    await batch.flush(t1)
    await batch.flush(t2)
    expect(await inner.queryByTraceId('t1')).toEqual(t1)
    expect(await inner.queryByTraceId('t2')).toEqual(t2)
  })

  it('uses maxBatchSize: 10 as the default', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner })
    for (let i = 0; i < 9; i++) await batch.flush(makeTrace(`t${i}`))
    expect(await inner.listTraceIds()).toEqual([]) // not yet drained
    await batch.flush(makeTrace('t9'))             // 10th → drain
    expect(await inner.listTraceIds()).toHaveLength(10)
  })
})

// ── drain() ───────────────────────────────────────────────────────────────────

describe('BatchAdapter — drain()', () => {
  it('flushes all buffered traces to the inner adapter', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    await batch.flush(makeTrace('a'))
    await batch.flush(makeTrace('b'))
    await batch.drain()
    expect((await inner.listTraceIds()).sort()).toEqual(['a', 'b'])
  })

  it('clears the buffer after draining', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    await batch.flush(makeTrace('x'))
    await batch.drain()
    await batch.drain() // second drain — inner should still only have 'x' once
    expect(await inner.listTraceIds()).toEqual(['x'])
  })

  it('is a no-op when the buffer is empty', async () => {
    const inner = new InMemoryAdapter()
    const flushSpy = vi.spyOn(inner, 'flush')
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 5 })
    await batch.drain()
    expect(flushSpy).not.toHaveBeenCalled()
  })

  it('sends all batched traces in parallel (order-independent)', async () => {
    const received: string[] = []
    const inner = new InMemoryAdapter()
    const origFlush = inner.flush.bind(inner)
    vi.spyOn(inner, 'flush').mockImplementation(async t => {
      received.push(t.id)
      return origFlush(t)
    })
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    await batch.flush(makeTrace('p'))
    await batch.flush(makeTrace('q'))
    await batch.drain()
    expect(received.sort()).toEqual(['p', 'q'])
  })
})

// ── stop() ────────────────────────────────────────────────────────────────────

describe('BatchAdapter — stop()', () => {
  it('drains remaining buffered traces before stopping', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    await batch.flush(makeTrace('z'))
    await batch.stop()
    expect(await inner.queryByTraceId('z')).not.toBeNull()
  })

  it('is safe to call when the buffer is already empty', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 5 })
    await expect(batch.stop()).resolves.toBeUndefined()
  })

  it('cancels the interval timer when one is running', async () => {
    const clearFn = vi.fn()
    const fakeFn = vi.fn().mockReturnValue(42 as unknown as ReturnType<typeof setInterval>)
    const batch = new BatchAdapter({
      adapter: new InMemoryAdapter(),
      maxBatchSize: 100,
      flushIntervalMs: 1000,
      setInterval: fakeFn,
      clearInterval: clearFn,
    })
    await batch.stop()
    expect(clearFn).toHaveBeenCalledWith(42)
  })

  it('does not call clearInterval when no timer was started', async () => {
    const clearFn = vi.fn()
    const batch = new BatchAdapter({
      adapter: new InMemoryAdapter(),
      maxBatchSize: 5,
      clearInterval: clearFn,
      // no flushIntervalMs → no timer started
    })
    await batch.stop()
    expect(clearFn).not.toHaveBeenCalled()
  })
})

// ── queryByTraceId() ──────────────────────────────────────────────────────────

describe('BatchAdapter — queryByTraceId()', () => {
  it('returns a trace that is still in the buffer', async () => {
    const inner = new InMemoryAdapter()
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    const trace = makeTrace('buf')
    await batch.flush(trace)
    expect(await batch.queryByTraceId('buf')).toEqual(trace)
  })

  it('falls through to the inner adapter when the trace is not buffered', async () => {
    const inner = new InMemoryAdapter()
    const trace = makeTrace('stored')
    await inner.flush(trace)
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    expect(await batch.queryByTraceId('stored')).toEqual(trace)
  })

  it('returns null when the trace is absent from both buffer and inner', async () => {
    const batch = new BatchAdapter({ adapter: new InMemoryAdapter(), maxBatchSize: 5 })
    expect(await batch.queryByTraceId('missing')).toBeNull()
  })
})

// ── listTraceIds() ────────────────────────────────────────────────────────────

describe('BatchAdapter — listTraceIds()', () => {
  it('includes IDs of traces still in the buffer', async () => {
    const batch = new BatchAdapter({ adapter: new InMemoryAdapter(), maxBatchSize: 100 })
    await batch.flush(makeTrace('buf1'))
    await batch.flush(makeTrace('buf2'))
    const ids = await batch.listTraceIds()
    expect(ids.sort()).toEqual(['buf1', 'buf2'])
  })

  it('includes IDs from the inner adapter', async () => {
    const inner = new InMemoryAdapter()
    await inner.flush(makeTrace('stored'))
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    expect(await batch.listTraceIds()).toContain('stored')
  })

  it('deduplicates IDs that appear in both buffer and inner', async () => {
    const inner = new InMemoryAdapter()
    const trace = makeTrace('dup')
    await inner.flush(trace)
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })
    await batch.flush(trace) // same id now in both
    const ids = await batch.listTraceIds()
    expect(ids.filter(id => id === 'dup')).toHaveLength(1)
  })

  it('returns an empty array when buffer and inner are both empty', async () => {
    const batch = new BatchAdapter({ adapter: new InMemoryAdapter(), maxBatchSize: 5 })
    expect(await batch.listTraceIds()).toEqual([])
  })
})
