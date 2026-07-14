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

  describe('constructor()', () => {
    it.each([NaN, -1, 1.5])('rejects invalid maxTraces: %s', maxTraces => {
      expect(() => new InMemoryAdapter({ maxTraces })).toThrow(RangeError)
    })

    it('allows explicit unbounded retention for legacy test fixtures', async () => {
      const unbounded = new InMemoryAdapter({ maxTraces: Infinity })
      for (let i = 0; i < 3; i++) {
        const trace = TraceContext.createTrace(`goal ${i}`)
        TraceContext.endTrace(trace)
        await unbounded.flush(trace)
      }

      expect(await unbounded.listTraceIds()).toHaveLength(3)
    })
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

    it('keeps the previous snapshot when an overwrite fails to clone', async () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'step' })
      SpanLifecycle.setMetadata(span, { safe: true })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)
      await adapter.flush(trace)

      Object.defineProperty(span.metadata, 'unsafe', {
        enumerable: true,
        get() {
          throw new Error('metadata exploded')
        },
      })

      await expect(adapter.flush(trace)).rejects.toThrow('metadata exploded')

      const retrieved = await adapter.queryByTraceId(trace.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.goal).toBe('goal')
      expect(retrieved!.spans[0]!.metadata).toEqual({ safe: true })
      expect(await adapter.listTraceIds()).toEqual([trace.id])
    })

    it('evicts older traces when flushing more than the configured retention bound', async () => {
      const bounded = new InMemoryAdapter({ maxTraces: 2 })
      const t1 = TraceContext.createTrace('first')
      const t2 = TraceContext.createTrace('second')
      const t3 = TraceContext.createTrace('third')
      TraceContext.endTrace(t1)
      TraceContext.endTrace(t2)
      TraceContext.endTrace(t3)

      await bounded.flush(t1)
      await bounded.flush(t2)
      await bounded.flush(t3)

      expect(await bounded.queryByTraceId(t1.id)).toBeNull()
      expect((await bounded.queryByTraceId(t2.id))!.goal).toBe('second')
      expect((await bounded.queryByTraceId(t3.id))!.goal).toBe('third')
      expect(await bounded.listTraceIds()).toEqual([t2.id, t3.id])
    })

    it('treats overwrites as the newest retained trace for deterministic eviction', async () => {
      const bounded = new InMemoryAdapter({ maxTraces: 2 })
      const t1 = TraceContext.createTrace('first')
      const t2 = TraceContext.createTrace('second')
      const t3 = TraceContext.createTrace('third')
      TraceContext.endTrace(t1)
      TraceContext.endTrace(t2)
      TraceContext.endTrace(t3)

      await bounded.flush(t1)
      await bounded.flush(t2)
      t1.goal = 'first updated'
      await bounded.flush(t1)
      await bounded.flush(t3)

      expect(await bounded.queryByTraceId(t2.id)).toBeNull()
      expect((await bounded.queryByTraceId(t1.id))!.goal).toBe('first updated')
      expect(await bounded.listTraceIds()).toEqual([t1.id, t3.id])
    })

    it('drops flushed traces immediately when maxTraces is zero', async () => {
      const disabled = new InMemoryAdapter({ maxTraces: 0 })
      const trace = TraceContext.createTrace('ephemeral')
      TraceContext.endTrace(trace)

      await disabled.flush(trace)

      expect(await disabled.queryByTraceId(trace.id)).toBeNull()
      expect(await disabled.listTraceIds()).toEqual([])
    })

    it('captures a flush-time snapshot and returns defensive query copies', async () => {
      const trace = TraceContext.createTrace('snapshot goal')
      const span = TraceContext.startSpan(trace, { name: 'original span' })
      span.metadata = { nested: { count: 1 }, label: 'before' }
      SpanLifecycle.addThoughtBlock(span, 'first thought')
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)

      trace.goal = 'mutated original goal'
      trace.status = 'error'
      trace.spans[0]!.name = 'mutated original span'
      trace.spans[0]!.metadata = { nested: { count: 2 }, label: 'after' }
      trace.spans[0]!.thoughtBlocks.push('mutated original thought')

      const firstQuery = await adapter.queryByTraceId(trace.id)
      expect(firstQuery).not.toBeNull()
      expect(firstQuery!.goal).toBe('snapshot goal')
      expect(firstQuery!.status).toBe('completed')
      expect(firstQuery!.spans[0]!.name).toBe('original span')
      expect(firstQuery!.spans[0]!.metadata).toEqual({ nested: { count: 1 }, label: 'before' })
      expect(firstQuery!.spans[0]!.thoughtBlocks).toEqual(['first thought'])

      firstQuery!.goal = 'mutated queried goal'
      firstQuery!.status = 'error'
      firstQuery!.spans[0]!.name = 'mutated queried span'
      firstQuery!.spans[0]!.metadata = { nested: { count: 3 }, label: 'queried' }
      firstQuery!.spans[0]!.thoughtBlocks.push('mutated queried thought')

      const secondQuery = await adapter.queryByTraceId(trace.id)
      expect(secondQuery!.goal).toBe('snapshot goal')
      expect(secondQuery!.status).toBe('completed')
      expect(secondQuery!.spans[0]!.name).toBe('original span')
      expect(secondQuery!.spans[0]!.metadata).toEqual({ nested: { count: 1 }, label: 'before' })
      expect(secondQuery!.spans[0]!.thoughtBlocks).toEqual(['first thought'])
    })

    it('tolerates uncloneable metadata values while snapshotting traces', async () => {
      const trace = TraceContext.createTrace('uncloneable metadata')
      const span = TraceContext.startSpan(trace, { name: 'metadata span' })
      const callback = () => 'value'
      const marker = Symbol('marker')
      SpanLifecycle.setMetadata(span, {
        callback,
        marker,
        nested: { callback, marker, kept: true },
      })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await expect(adapter.flush(trace)).resolves.toBeUndefined()

      const retrieved = await adapter.queryByTraceId(trace.id)
      expect(retrieved!.spans[0]!.metadata).toEqual({
        callback: String(callback),
        marker: String(marker),
        nested: { callback: String(callback), marker: String(marker), kept: true },
      })
    })

    it('preserves repeated uncloneable metadata references without treating them as cycles', async () => {
      const trace = TraceContext.createTrace('shared metadata')
      const span = TraceContext.startSpan(trace, { name: 'shared metadata span' })
      const callback = () => 'shared'
      const shared = { callback, kept: true }
      SpanLifecycle.setMetadata(span, { a: shared, b: shared })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)

      const retrieved = await adapter.queryByTraceId(trace.id)
      expect(retrieved!.spans[0]!.metadata).toEqual({
        a: { callback: String(callback), kept: true },
        b: { callback: String(callback), kept: true },
      })
    })

    it('preserves container, Error, and __proto__ metadata during fallback cloning', async () => {
      const trace = TraceContext.createTrace('container metadata')
      const span = TraceContext.startSpan(trace, { name: 'container metadata span' })
      const callback = () => 'container'
      const error = new Error('boom') as Error & { code?: string; details?: { retryable: boolean } }
      error.code = 'E_BOOM'
      error.details = { retryable: true }
      const protoValue = { polluted: true }
      SpanLifecycle.setMetadata(span, {
        tools: new Map<string, unknown>([['cb', callback]]),
        values: new Set<unknown>([callback, 'kept']),
        error,
        callback,
      })
      Object.defineProperty(span.metadata, '__proto__', {
        value: protoValue,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)

      const retrieved = await adapter.queryByTraceId(trace.id)
      const metadata = retrieved!.spans[0]!.metadata
      expect(metadata['tools']).toEqual(new Map([['cb', String(callback)]]))
      expect(metadata['values']).toEqual(new Set([String(callback), 'kept']))
      expect(metadata['error']).toMatchObject({
        name: 'Error',
        message: 'boom',
        code: 'E_BOOM',
        details: { retryable: true },
      })
      expect(Object.prototype.hasOwnProperty.call(metadata, '__proto__')).toBe(true)
      expect(metadata['__proto__']).toEqual(protoValue)
      expect(Object.getPrototypeOf(metadata)).toBe(Object.prototype)
    })

    it('preserves binary, RegExp, and cyclic Error metadata snapshots', async () => {
      const trace = TraceContext.createTrace('complex metadata')
      const span = TraceContext.startSpan(trace, { name: 'complex metadata span' })
      const bytes = new Uint8Array([1, 2, 3])
      const view = new DataView(new Uint8Array([4, 5, 6, 7]).buffer, 1, 2)
      const regex = /ab/g
      regex.lastIndex = 2
      const cyclicError = new Error('cyclic') as Error & { cause?: unknown }
      cyclicError.cause = cyclicError
      const aggregate = new AggregateError([cyclicError], 'many')
      SpanLifecycle.setMetadata(span, { bytes, view, regex, cyclicError, aggregate })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      bytes[0] = 9
      regex.lastIndex = 0

      const retrieved = await adapter.queryByTraceId(trace.id)
      const metadata = retrieved!.spans[0]!.metadata
      expect(metadata['bytes']).toEqual(new Uint8Array([1, 2, 3]))
      expect(Array.from(new Uint8Array((metadata['view'] as DataView).buffer))).toEqual([5, 6])
      expect(metadata['regex']).toMatchObject({ source: 'ab', flags: 'g', lastIndex: 2 })
      expect(metadata['cyclicError']).toMatchObject({ name: 'Error', message: 'cyclic' })
      expect((metadata['cyclicError'] as { cause: unknown }).cause).toBe(metadata['cyclicError'])
      expect(metadata['aggregate']).toMatchObject({ name: 'AggregateError', message: 'many' })
      expect((metadata['aggregate'] as { errors: unknown[] }).errors).toHaveLength(1)
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

  describe('clear()', () => {
    it('removes all retained traces', async () => {
      const trace = TraceContext.createTrace('clear me')
      TraceContext.endTrace(trace)
      await adapter.flush(trace)

      adapter.clear()

      expect(await adapter.queryByTraceId(trace.id)).toBeNull()
      expect(await adapter.listTraceIds()).toEqual([])
    })
  })
})
