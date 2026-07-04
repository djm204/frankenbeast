import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TraceContext } from '../core/TraceContext.js'
import { SpanLifecycle } from '../core/SpanLifecycle.js'
import { InMemoryAdapter } from './InMemoryAdapter.js'

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter
  let warningSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    adapter = new InMemoryAdapter()
    warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => true)
  })

  afterEach(() => {
    warningSpy.mockRestore()
  })

  describe('flush()', () => {
    it('stores a trace so it can be retrieved by id', async () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      const retrieved = await adapter.queryByTraceId(trace.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(trace.id)
      expect(retrieved!.goal).toBe('goal')
    })

    it('preserves spans on the retrieved trace', async () => {
      const trace = TraceContext.createTrace('goal')
      const s1 = TraceContext.startSpan(trace, { name: 'alpha' })
      SpanLifecycle.addThoughtBlock(s1, 'thinking...')
      TraceContext.endSpan(s1)
      const s2 = TraceContext.startSpan(trace, { name: 'beta' })
      TraceContext.endSpan(s2)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      const retrieved = await adapter.queryByTraceId(trace.id)
      expect(retrieved!.spans).toHaveLength(2)
      expect(retrieved!.spans[0]!.name).toBe('alpha')
      expect(retrieved!.spans[0]!.thoughtBlocks).toEqual(['thinking...'])
      expect(retrieved!.spans[1]!.name).toBe('beta')
    })

    it('overwrites a previously stored trace (upsert)', async () => {
      const trace = TraceContext.createTrace('goal')
      TraceContext.endTrace(trace)
      await adapter.flush(trace)

      // Re-flush after mutation
      trace.goal = 'updated goal'
      await adapter.flush(trace)

      const retrieved = await adapter.queryByTraceId(trace.id)
      expect(retrieved!.goal).toBe('updated goal')
    })

    it('warns when exporting a trace that still has active spans', async () => {
      const trace = TraceContext.createTrace('goal')
      TraceContext.startSpan(trace, { name: 'orphaned' })

      await adapter.flush(trace)

      expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('active span(s)'))
      expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('orphaned'))
    })
  })

  describe('queryByTraceId()', () => {
    it('returns null for an unknown trace id', async () => {
      const result = await adapter.queryByTraceId('does-not-exist')
      expect(result).toBeNull()
    })

    it('can retrieve multiple distinct traces independently', async () => {
      const t1 = TraceContext.createTrace('first')
      TraceContext.endTrace(t1)
      const t2 = TraceContext.createTrace('second')
      TraceContext.endTrace(t2)

      await adapter.flush(t1)
      await adapter.flush(t2)

      const r1 = await adapter.queryByTraceId(t1.id)
      const r2 = await adapter.queryByTraceId(t2.id)
      expect(r1!.goal).toBe('first')
      expect(r2!.goal).toBe('second')
    })
  })

  describe('listTraceIds()', () => {
    it('returns all stored trace ids', async () => {
      const t1 = TraceContext.createTrace('a')
      const t2 = TraceContext.createTrace('b')
      TraceContext.endTrace(t1)
      TraceContext.endTrace(t2)
      await adapter.flush(t1)
      await adapter.flush(t2)

      const ids = await adapter.listTraceIds()
      expect(ids).toContain(t1.id)
      expect(ids).toContain(t2.id)
      expect(ids).toHaveLength(2)
    })

    it('returns an empty array when nothing is stored', async () => {
      expect(await adapter.listTraceIds()).toEqual([])
    })
  })
})
