import { describe, it, expect, vi } from 'vitest'
import { BatchAdapter } from './BatchAdapter.js'
import { InMemoryAdapter } from '../../export/InMemoryAdapter.js'
import type { Trace } from '../../core/types.js'
import type { ExportAdapter } from '../../export/ExportAdapter.js'

function makeTrace(id: string): Trace {
  return { id, goal: 'test', status: 'completed', startedAt: Date.now(), spans: [] }
}

class FailingFlushAdapter implements ExportAdapter {
  async flush(_trace: Trace): Promise<void> {
    throw new Error('database temporarily locked')
  }

  async queryByTraceId(_traceId: string): Promise<Trace | null> {
    return null
  }

  async listTraceIds(): Promise<string[]> {
    return []
  }
}

function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ── options ───────────────────────────────────────────────────────────────────

describe('BatchAdapter — options', () => {
  it.each([
    Number.NaN,
    Infinity,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid maxBatchSize: %s', maxBatchSize => {
    expect(() => new BatchAdapter({
      adapter: new InMemoryAdapter(),
      maxBatchSize,
    })).toThrow(RangeError)
  })

  it.each([
    Number.NaN,
    Infinity,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid flushIntervalMs: %s', flushIntervalMs => {
    const setIntervalFn = vi.fn()

    expect(() => new BatchAdapter({
      adapter: new InMemoryAdapter(),
      flushIntervalMs,
      setInterval: setIntervalFn,
    })).toThrow(RangeError)
    expect(setIntervalFn).not.toHaveBeenCalled()
  })

  it('accepts valid integer boundaries for batch size and timer options', async () => {
    const inner = new InMemoryAdapter()
    const setIntervalFn = vi.fn().mockReturnValue(42 as unknown as ReturnType<typeof globalThis.setInterval>)
    const clearIntervalFn = vi.fn()
    const batch = new BatchAdapter({
      adapter: inner,
      maxBatchSize: 1,
      flushIntervalMs: 1,
      setInterval: setIntervalFn,
      clearInterval: clearIntervalFn,
    })

    await batch.flush(makeTrace('valid-boundary'))
    expect(await inner.listTraceIds()).toEqual(['valid-boundary'])
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 1)

    await batch.stop()
    expect(clearIntervalFn).toHaveBeenCalledWith(42)
  })
})

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

  it('keeps buffered traces when the inner adapter rejects during drain', async () => {
    const batch = new BatchAdapter({ adapter: new FailingFlushAdapter(), maxBatchSize: 100 })
    const trace = makeTrace('retry-me')

    await batch.flush(trace)
    await expect(batch.drain()).rejects.toThrow('database temporarily locked')

    expect(await batch.queryByTraceId('retry-me')).toEqual(trace)
    expect(await batch.listTraceIds()).toEqual(['retry-me'])
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

  it('waits for every flush in a failed batch before retrying only failed traces', async () => {
    const slowSuccess = deferred()
    const calls: string[] = []
    const inner: ExportAdapter = {
      async flush(trace) {
        calls.push(trace.id)
        if (trace.id === 'slow-success') return slowSuccess.promise
        throw new Error('fast failure')
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })

    await batch.flush(makeTrace('fast-fail'))
    await batch.flush(makeTrace('slow-success'))
    const drainPromise = batch.drain()
    let rejectedBeforeSlowFlushSettled = false
    drainPromise.catch(() => { rejectedBeforeSlowFlushSettled = true })
    await Promise.resolve()

    expect(rejectedBeforeSlowFlushSettled).toBe(false)

    slowSuccess.resolve()
    await expect(drainPromise).rejects.toThrow('fast failure')
    expect(await batch.listTraceIds()).toEqual(['fast-fail'])

    await expect(batch.drain()).rejects.toThrow('fast failure')
    expect(calls).toEqual(['fast-fail', 'slow-success', 'fast-fail'])
  })

  it('retains failed traces for retry without duplicating successful traces after partial drain failure', async () => {
    const inner = new InMemoryAdapter()
    const failedOnce = new Set<string>()
    const calls: string[] = []
    vi.spyOn(inner, 'flush').mockImplementation(async trace => {
      calls.push(trace.id)
      if (trace.id === 'retry-later' && !failedOnce.has(trace.id)) {
        failedOnce.add(trace.id)
        throw new Error('transient exporter failure')
      }
      await InMemoryAdapter.prototype.flush.call(inner, trace)
    })
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })

    const alreadyPersisted = makeTrace('already-persisted')
    const retryLater = makeTrace('retry-later')

    await batch.flush(alreadyPersisted)
    await batch.flush(retryLater)
    await expect(batch.drain()).rejects.toThrow('transient exporter failure')

    expect(await inner.listTraceIds()).toEqual(['already-persisted'])
    expect(await batch.queryByTraceId('retry-later')).toEqual(retryLater)
    expect((await batch.listTraceIds()).sort()).toEqual(['already-persisted', 'retry-later'])

    await expect(batch.drain()).resolves.toBeUndefined()
    expect((await inner.listTraceIds()).sort()).toEqual(['already-persisted', 'retry-later'])
    expect(calls).toEqual(['already-persisted', 'retry-later', 'retry-later'])
  })

  it('does not fail a newly queued trace because an older drain rejects', async () => {
    const oldFailure = deferred()
    const inner: ExportAdapter = {
      async flush(trace) {
        if (trace.id === 'old') return oldFailure.promise
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 1 })

    const oldFlush = batch.flush(makeTrace('old'))
    const newFlush = batch.flush(makeTrace('new'))

    oldFailure.reject(new Error('old batch failed'))
    await expect(oldFlush).rejects.toThrow('old batch failed')
    await expect(newFlush).resolves.toBeUndefined()
    expect(await batch.listTraceIds()).toEqual(['old'])
  })

  it('surfaces failures from follow-up size-triggered drains after the older drain succeeds', async () => {
    const oldSuccess = deferred()
    const inner: ExportAdapter = {
      async flush(trace) {
        if (trace.id === 'old') return oldSuccess.promise
        throw new Error('new batch failed')
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 1 })

    const oldFlush = batch.flush(makeTrace('old'))
    const newFlush = batch.flush(makeTrace('new'))
    oldSuccess.resolve()

    await expect(oldFlush).resolves.toBeUndefined()
    await expect(newFlush).rejects.toThrow('new batch failed')
    expect(await batch.listTraceIds()).toEqual(['new'])
  })

  it('drains a snapshot instead of chasing traces appended during the drain', async () => {
    const received: string[] = []
    let batch!: BatchAdapter
    const inner: ExportAdapter = {
      async flush(trace) {
        received.push(trace.id)
        if (trace.id === 'initial') await batch.flush(makeTrace('appended'))
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })

    await batch.flush(makeTrace('initial'))
    await batch.drain()

    expect(received).toEqual(['initial'])
    expect(await batch.listTraceIds()).toEqual(['appended'])
  })

  it('sets the drain guard before invoking inner flush callbacks', async () => {
    const received: string[] = []
    let batch!: BatchAdapter
    const inner: ExportAdapter = {
      async flush(trace) {
        received.push(trace.id)
        if (trace.id === 'initial') void batch.flush(makeTrace('appended'))
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    batch = new BatchAdapter({ adapter: inner, maxBatchSize: 1 })

    await batch.flush(makeTrace('initial'))
    await batch.drain()

    expect(received).toEqual(['initial', 'appended'])
    expect(await batch.listTraceIds()).toEqual([])
  })

  it('drops an older failed duplicate when a newer trace with the same id succeeds', async () => {
    const older = { ...makeTrace('same-id'), goal: 'older' }
    const newer = { ...makeTrace('same-id'), goal: 'newer' }
    const inner = new InMemoryAdapter()
    const calls: string[] = []
    vi.spyOn(inner, 'flush').mockImplementation(async trace => {
      calls.push(trace.goal)
      if (trace.goal === 'older') throw new Error('stale write failed')
      await InMemoryAdapter.prototype.flush.call(inner, trace)
    })
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })

    await batch.flush(older)
    await batch.flush(newer)
    await batch.drain()

    expect(await batch.listTraceIds()).toEqual(['same-id'])
    expect(await batch.queryByTraceId('same-id')).toEqual(newer)
    expect(calls).toEqual(['older', 'newer'])
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

  it('waits for traces appended during an in-flight drain before stopping', async () => {
    const firstFlush = deferred()
    const received: string[] = []
    const inner: ExportAdapter = {
      async flush(trace) {
        received.push(trace.id)
        if (trace.id === 'initial') return firstFlush.promise
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })

    await batch.flush(makeTrace('initial'))
    const inFlightDrain = batch.drain()
    await batch.flush(makeTrace('appended'))
    const stopPromise = batch.stop()
    firstFlush.resolve()

    await expect(inFlightDrain).resolves.toBeUndefined()
    await expect(stopPromise).resolves.toBeUndefined()
    expect(received).toEqual(['initial', 'appended'])
    expect(await batch.listTraceIds()).toEqual([])
  })

  it('attempts appended traces before stop rejects an older in-flight drain failure', async () => {
    const oldFailure = deferred()
    const received: string[] = []
    const inner: ExportAdapter = {
      async flush(trace) {
        received.push(trace.id)
        if (trace.id === 'old') return oldFailure.promise
      },
      async queryByTraceId() { return null },
      async listTraceIds() { return [] },
    }
    const batch = new BatchAdapter({ adapter: inner, maxBatchSize: 100 })

    await batch.flush(makeTrace('old'))
    const inFlightDrain = batch.drain()
    await batch.flush(makeTrace('appended'))
    const stopPromise = batch.stop()
    oldFailure.reject(new Error('old drain failed'))

    await expect(inFlightDrain).rejects.toThrow('old drain failed')
    await expect(stopPromise).rejects.toThrow('old drain failed')
    expect(received).toEqual(['old', 'old', 'appended'])
    expect(await batch.listTraceIds()).toEqual(['old'])
  })

  it('retains shutdown traces when stop fails to flush them', async () => {
    const batch = new BatchAdapter({ adapter: new FailingFlushAdapter(), maxBatchSize: 100 })
    const trace = makeTrace('shutdown-retry')

    await batch.flush(trace)
    await expect(batch.stop()).rejects.toThrow('database temporarily locked')

    expect(await batch.queryByTraceId('shutdown-retry')).toEqual(trace)
    expect(await batch.listTraceIds()).toEqual(['shutdown-retry'])
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
