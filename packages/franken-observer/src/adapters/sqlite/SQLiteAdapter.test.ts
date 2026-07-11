import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

const { pragmaMock, execMock, prepareMock, transactionMock, closeMock } = vi.hoisted(() => ({
  pragmaMock: vi.fn(),
  execMock: vi.fn(),
  prepareMock: vi.fn(),
  transactionMock: vi.fn(),
  closeMock: vi.fn(),
}))

vi.mock('better-sqlite3', () => ({
  default: vi.fn(function MockDatabase() {
    return {
      pragma: pragmaMock,
      exec: execMock,
      prepare: prepareMock,
      transaction: transactionMock,
      close: closeMock,
    }
  }),
}))

import { SQLiteAdapter } from './SQLiteAdapter.js'
import { TraceContext } from '../../core/TraceContext.js'
import { SpanLifecycle } from '../../core/SpanLifecycle.js'

describe('SQLiteAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('configures WAL, foreign keys, and a busy timeout so concurrent writers wait for locks', () => {
    const adapter = new SQLiteAdapter('/tmp/traces.db')

    expect(Database).toHaveBeenCalledWith('/tmp/traces.db')
    expect(pragmaMock.mock.calls.map(call => call[0])).toEqual([
      'busy_timeout = 5000',
      'journal_mode = WAL',
      'foreign_keys = ON',
    ])

    adapter.close()
  })

  it('only upserts new or dirty spans on repeated flushes', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (trace: unknown) => fn(trace))

    const adapter = new SQLiteAdapter('/tmp/traces.db')
    const trace = TraceContext.createTrace('goal')
    const first = TraceContext.startSpan(trace, { name: 'first' })
    SpanLifecycle.setMetadata(first, { step: 1 })
    TraceContext.endSpan(first)

    await adapter.flush(trace)
    expect(upsertSpanRun).toHaveBeenCalledTimes(1)

    await adapter.flush(trace)
    expect(upsertSpanRun).toHaveBeenCalledTimes(1)

    const clonedTrace = {
      ...trace,
      spans: trace.spans.map(span => ({
        ...span,
        metadata: { ...span.metadata },
        thoughtBlocks: [...span.thoughtBlocks],
      })),
    }
    await adapter.flush(clonedTrace)
    expect(upsertSpanRun).toHaveBeenCalledTimes(1)

    first.metadata.step = 3
    await adapter.flush(trace)
    expect(upsertSpanRun).toHaveBeenCalledTimes(2)
    expect(upsertSpanRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: first.id, metadata: JSON.stringify({ step: 3 }) }),
    )

    const second = TraceContext.startSpan(trace, { name: 'second' })
    SpanLifecycle.setMetadata(second, { step: 2 })
    TraceContext.endSpan(second)
    await adapter.flush(trace)

    expect(upsertSpanRun).toHaveBeenCalledTimes(3)
    expect(upsertSpanRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: second.id, metadata: JSON.stringify({ step: 2 }) }),
    )
  })

  it('does not update the flushed-span cache when the SQLite transaction rolls back', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('write failed')
      })
      .mockImplementation(() => undefined)
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (trace: unknown) => fn(trace))

    const adapter = new SQLiteAdapter('/tmp/traces.db')
    const trace = TraceContext.createTrace('goal')
    const first = TraceContext.startSpan(trace, { name: 'first' })
    const second = TraceContext.startSpan(trace, { name: 'second' })
    TraceContext.endSpan(first)
    TraceContext.endSpan(second)

    await expect(adapter.flush(trace)).rejects.toThrow('write failed')
    await adapter.flush(trace)

    expect(upsertSpanRun).toHaveBeenCalledTimes(4)
    expect(upsertSpanRun.mock.calls[2]?.[0]).toEqual(expect.objectContaining({ id: first.id }))
    expect(upsertSpanRun.mock.calls[3]?.[0]).toEqual(expect.objectContaining({ id: second.id }))
  })

  it('bounds flushed-span snapshots by evicting older trace groups', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (trace: unknown) => fn(trace))

    const adapter = new SQLiteAdapter('/tmp/traces.db', { maxFlushedSpanSnapshots: 1 })
    const firstTrace = TraceContext.createTrace('first')
    const firstSpan = TraceContext.startSpan(firstTrace, { name: 'first' })
    TraceContext.endSpan(firstSpan)
    const secondTrace = TraceContext.createTrace('second')
    const secondSpan = TraceContext.startSpan(secondTrace, { name: 'second' })
    TraceContext.endSpan(secondSpan)

    await adapter.flush(firstTrace)
    await adapter.flush(secondTrace)
    await adapter.flush(firstTrace)

    expect(upsertSpanRun).toHaveBeenCalledTimes(3)
    expect(upsertSpanRun.mock.calls[2]?.[0]).toEqual(expect.objectContaining({ id: firstSpan.id }))
  })
})
