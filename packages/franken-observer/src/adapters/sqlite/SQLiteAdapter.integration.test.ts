import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unlinkSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { TraceContext } from '../../core/TraceContext.js'
import { SpanLifecycle } from '../../core/SpanLifecycle.js'
import { SQLiteAdapter } from './SQLiteAdapter.js'

function tempDbPath() {
  return join(tmpdir(), `franken-observer-test-${randomUUID()}.db`)
}

function cleanup(path: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    const p = path + suffix
    if (existsSync(p)) unlinkSync(p)
  }
}

describe('SQLiteAdapter', () => {
  let dbPath: string
  let adapter: SQLiteAdapter

  beforeEach(() => {
    dbPath = tempDbPath()
    adapter = new SQLiteAdapter(dbPath)
  })

  afterEach(() => {
    adapter.close()
    cleanup(dbPath)
  })

  describe('flush() + queryByTraceId()', () => {
    it('persists a trace and retrieves it by id', async () => {
      const trace = TraceContext.createTrace('search the web')
      const span = TraceContext.startSpan(trace, { name: 'tool-call' })
      TraceContext.endSpan(span)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      const result = await adapter.queryByTraceId(trace.id)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(trace.id)
      expect(result!.goal).toBe('search the web')
      expect(result!.status).toBe('completed')
    })

    it('persists all spans with correct fields', async () => {
      const trace = TraceContext.createTrace('goal')
      const parent = TraceContext.startSpan(trace, { name: 'parent-step' })
      SpanLifecycle.recordTokenUsage(parent, { promptTokens: 200, completionTokens: 100, model: 'claude-opus-4-6' })
      SpanLifecycle.addThoughtBlock(parent, 'deciding strategy')
      const child = TraceContext.startSpan(trace, { name: 'child-step', parentSpanId: parent.id })
      TraceContext.endSpan(child)
      TraceContext.endSpan(parent)
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      const result = await adapter.queryByTraceId(trace.id)

      expect(result!.spans).toHaveLength(2)
      const p = result!.spans.find(s => s.name === 'parent-step')!
      expect(p.metadata['promptTokens']).toBe(200)
      expect(p.metadata['model']).toBe('claude-opus-4-6')
      expect(p.thoughtBlocks).toEqual(['deciding strategy'])
      expect(p.durationMs).toBeGreaterThanOrEqual(0)

      const c = result!.spans.find(s => s.name === 'child-step')!
      expect(c.parentSpanId).toBe(parent.id)
    })

    it('persists errored spans with errorMessage', async () => {
      const trace = TraceContext.createTrace('goal')
      const span = TraceContext.startSpan(trace, { name: 'bad-step' })
      TraceContext.endSpan(span, { status: 'error', errorMessage: 'timeout' })
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      const result = await adapter.queryByTraceId(trace.id)
      const s = result!.spans[0]!
      expect(s.status).toBe('error')
      expect(s.errorMessage).toBe('timeout')
    })

    it('returns null for an unknown trace id', async () => {
      const result = await adapter.queryByTraceId('ghost-id')
      expect(result).toBeNull()
    })

    it('upserts — re-flushing a trace overwrites the stored version', async () => {
      const trace = TraceContext.createTrace('original')
      TraceContext.endTrace(trace)
      await adapter.flush(trace)

      trace.goal = 'updated'
      await adapter.flush(trace)

      const result = await adapter.queryByTraceId(trace.id)
      expect(result!.goal).toBe('updated')
    })
  })

  describe('process restart simulation', () => {
    it('a 10-span trace survives closing and reopening the DB', async () => {
      const trace = TraceContext.createTrace('long task')
      for (let i = 0; i < 10; i++) {
        const span = TraceContext.startSpan(trace, { name: `step-${i}` })
        SpanLifecycle.setMetadata(span, { index: i })
        TraceContext.endSpan(span)
      }
      TraceContext.endTrace(trace)

      await adapter.flush(trace)
      adapter.close()

      // Simulate restart: new adapter instance, same file
      const restarted = new SQLiteAdapter(dbPath)
      const result = await restarted.queryByTraceId(trace.id)
      restarted.close()

      expect(result).not.toBeNull()
      expect(result!.spans).toHaveLength(10)
      for (let i = 0; i < 10; i++) {
        const span = result!.spans.find(s => s.name === `step-${i}`)!
        expect(span.metadata['index']).toBe(i)
      }
    })
  })

  describe('listTraceIds()', () => {
    it('returns ids of all persisted traces', async () => {
      const t1 = TraceContext.createTrace('first')
      const t2 = TraceContext.createTrace('second')
      TraceContext.endTrace(t1)
      TraceContext.endTrace(t2)
      await adapter.flush(t1)
      await adapter.flush(t2)

      const ids = await adapter.listTraceIds()
      expect(ids).toContain(t1.id)
      expect(ids).toContain(t2.id)
    })

    it('returns an empty array on a fresh DB', async () => {
      expect(await adapter.listTraceIds()).toEqual([])
    })
  })

  describe('concurrent sequential writes', () => {
    it('handles 20 traces written in rapid succession without corruption', async () => {
      const traces = Array.from({ length: 20 }, (_, i) => {
        const t = TraceContext.createTrace(`task-${i}`)
        const s = TraceContext.startSpan(t, { name: 'work' })
        SpanLifecycle.setMetadata(s, { taskIndex: i })
        TraceContext.endSpan(s)
        TraceContext.endTrace(t)
        return t
      })

      await Promise.all(traces.map(t => adapter.flush(t)))

      const ids = await adapter.listTraceIds()
      expect(ids).toHaveLength(20)

      for (const trace of traces) {
        const result = await adapter.queryByTraceId(trace.id)
        expect(result).not.toBeNull()
        expect(result!.spans[0]!.metadata['taskIndex']).toBe(
          Number(trace.goal.split('-')[1]),
        )
      }
    })
  })
})
