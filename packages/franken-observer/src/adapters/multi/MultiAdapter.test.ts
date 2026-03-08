import { describe, it, expect, vi } from 'vitest'
import { MultiAdapter } from './MultiAdapter.js'
import { InMemoryAdapter } from '../../export/InMemoryAdapter.js'
import type { ExportAdapter } from '../../export/ExportAdapter.js'
import type { Trace } from '../../core/types.js'

function makeTrace(id = 'trace-1'): Trace {
  return {
    id,
    goal: 'test',
    status: 'completed',
    startedAt: Date.now(),
    endedAt: Date.now(),
    spans: [],
  }
}

function failingAdapter(message = 'adapter error'): ExportAdapter {
  return {
    flush: vi.fn().mockRejectedValue(new Error(message)),
    queryByTraceId: vi.fn().mockResolvedValue(null),
    listTraceIds: vi.fn().mockResolvedValue([]),
  }
}

describe('MultiAdapter', () => {
  describe('flush()', () => {
    it('calls flush() on every adapter', async () => {
      const a = new InMemoryAdapter()
      const b = new InMemoryAdapter()
      const multi = new MultiAdapter({ adapters: [a, b] })
      const trace = makeTrace()
      await multi.flush(trace)
      expect(await a.queryByTraceId(trace.id)).toEqual(trace)
      expect(await b.queryByTraceId(trace.id)).toEqual(trace)
    })

    it('passes the same trace object to all adapters', async () => {
      const spyA = vi.fn().mockResolvedValue(undefined)
      const spyB = vi.fn().mockResolvedValue(undefined)
      const adapterA: ExportAdapter = { flush: spyA, queryByTraceId: vi.fn().mockResolvedValue(null), listTraceIds: vi.fn().mockResolvedValue([]) }
      const adapterB: ExportAdapter = { flush: spyB, queryByTraceId: vi.fn().mockResolvedValue(null), listTraceIds: vi.fn().mockResolvedValue([]) }
      const multi = new MultiAdapter({ adapters: [adapterA, adapterB] })
      const trace = makeTrace()
      await multi.flush(trace)
      expect(spyA).toHaveBeenCalledWith(trace)
      expect(spyB).toHaveBeenCalledWith(trace)
    })

    it('resolves when all adapters succeed', async () => {
      const multi = new MultiAdapter({ adapters: [new InMemoryAdapter(), new InMemoryAdapter()] })
      await expect(multi.flush(makeTrace())).resolves.toBeUndefined()
    })

    it('throws if any adapter rejects (default throwOnError: true)', async () => {
      const multi = new MultiAdapter({ adapters: [new InMemoryAdapter(), failingAdapter('boom')] })
      await expect(multi.flush(makeTrace())).rejects.toThrow('boom')
    })

    it('error message identifies how many adapters failed', async () => {
      const multi = new MultiAdapter({
        adapters: [failingAdapter('err1'), failingAdapter('err2')],
      })
      await expect(multi.flush(makeTrace())).rejects.toThrow('2 adapter')
    })

    it('still calls all adapters even when one fails (allSettled semantics)', async () => {
      const failSpy = vi.fn().mockRejectedValue(new Error('boom'))
      const passSpy = vi.fn().mockResolvedValue(undefined)
      const fail: ExportAdapter = { flush: failSpy, queryByTraceId: vi.fn().mockResolvedValue(null), listTraceIds: vi.fn().mockResolvedValue([]) }
      const pass: ExportAdapter = { flush: passSpy, queryByTraceId: vi.fn().mockResolvedValue(null), listTraceIds: vi.fn().mockResolvedValue([]) }
      const multi = new MultiAdapter({ adapters: [fail, pass] })
      await expect(multi.flush(makeTrace())).rejects.toThrow()
      expect(failSpy).toHaveBeenCalledTimes(1)
      expect(passSpy).toHaveBeenCalledTimes(1)
    })

    it('does not throw when throwOnError is false and an adapter fails', async () => {
      const multi = new MultiAdapter({
        adapters: [new InMemoryAdapter(), failingAdapter('silent fail')],
        throwOnError: false,
      })
      await expect(multi.flush(makeTrace())).resolves.toBeUndefined()
    })

    it('resolves immediately with empty adapters list', async () => {
      const multi = new MultiAdapter({ adapters: [] })
      await expect(multi.flush(makeTrace())).resolves.toBeUndefined()
    })
  })

  describe('queryByTraceId()', () => {
    it('returns the trace from the first adapter that has it', async () => {
      const a = new InMemoryAdapter()
      const b = new InMemoryAdapter()
      const trace = makeTrace()
      await a.flush(trace)
      const multi = new MultiAdapter({ adapters: [a, b] })
      expect(await multi.queryByTraceId(trace.id)).toEqual(trace)
    })

    it('falls through to a later adapter when an earlier one returns null', async () => {
      const a = new InMemoryAdapter() // empty
      const b = new InMemoryAdapter()
      const trace = makeTrace()
      await b.flush(trace)
      const multi = new MultiAdapter({ adapters: [a, b] })
      expect(await multi.queryByTraceId(trace.id)).toEqual(trace)
    })

    it('returns null when no adapter has the trace', async () => {
      const multi = new MultiAdapter({ adapters: [new InMemoryAdapter(), new InMemoryAdapter()] })
      expect(await multi.queryByTraceId('missing')).toBeNull()
    })

    it('returns null with empty adapters list', async () => {
      const multi = new MultiAdapter({ adapters: [] })
      expect(await multi.queryByTraceId('any')).toBeNull()
    })
  })

  describe('listTraceIds()', () => {
    it('returns the union of all adapters trace ids', async () => {
      const a = new InMemoryAdapter()
      const b = new InMemoryAdapter()
      await a.flush(makeTrace('t1'))
      await a.flush(makeTrace('t2'))
      await b.flush(makeTrace('t3'))
      const multi = new MultiAdapter({ adapters: [a, b] })
      const ids = await multi.listTraceIds()
      expect(ids.sort()).toEqual(['t1', 't2', 't3'])
    })

    it('deduplicates ids that appear in multiple adapters', async () => {
      const a = new InMemoryAdapter()
      const b = new InMemoryAdapter()
      const trace = makeTrace('shared')
      await a.flush(trace)
      await b.flush(trace)
      const multi = new MultiAdapter({ adapters: [a, b] })
      const ids = await multi.listTraceIds()
      expect(ids).toEqual(['shared'])
    })

    it('returns an empty array with empty adapters list', async () => {
      const multi = new MultiAdapter({ adapters: [] })
      expect(await multi.listTraceIds()).toEqual([])
    })

    it('returns an empty array when all adapters are empty', async () => {
      const multi = new MultiAdapter({ adapters: [new InMemoryAdapter(), new InMemoryAdapter()] })
      expect(await multi.listTraceIds()).toEqual([])
    })
  })
})
