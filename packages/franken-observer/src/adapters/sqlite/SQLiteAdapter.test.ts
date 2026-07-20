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

import { SQLiteAdapter, SQLiteLockRetryExhaustedError } from './SQLiteAdapter.js'
import { TraceContext } from '../../core/TraceContext.js'
import { SpanLifecycle } from '../../core/SpanLifecycle.js'

function sqliteBusyError(): Error & { code: string } {
  const error = new Error('database is locked') as Error & { code: string }
  error.code = 'SQLITE_BUSY'
  return error
}

describe('SQLiteAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pragmaMock.mockReset()
  })

  it('configures WAL, foreign keys, and a busy timeout so concurrent writers wait for locks', () => {
    const adapter = new SQLiteAdapter('/tmp/traces.db')

    expect(Database).toHaveBeenCalledWith('/tmp/traces.db')
    expect(pragmaMock.mock.calls.map(call => call[0])).toEqual([
      'busy_timeout = 5000',
      'journal_mode = WAL',
      'foreign_keys = ON',
      "index_list('spans')",
    ])
    expect(execMock).toHaveBeenCalledTimes(1)

    adapter.close()
  })

  it('executes schema DDL only once when multiple adapters open the same initialized database', () => {
    pragmaMock.mockImplementation((statement: string) => {
      if (statement === "index_list('spans')") {
        return execMock.mock.calls.length === 0 ? [] : [{ name: 'idx_spans_traceId_startedAt' }]
      }
      return undefined
    })

    const first = new SQLiteAdapter('/tmp/shared-traces.db')
    const second = new SQLiteAdapter('/tmp/shared-traces.db')

    expect(execMock).toHaveBeenCalledTimes(1)

    first.close()
    second.close()
  })

  it('validates retry options before opening a database handle', () => {
    expect(() => new SQLiteAdapter('/tmp/traces.db', { maxLockRetries: -1 })).toThrow(
      'maxLockRetries must be an integer between 0 and 10',
    )
    expect(Database).not.toHaveBeenCalled()
  })

  it('retries SQLite locks raised during adapter initialization', () => {
    const diagnostics = vi.fn()
    pragmaMock
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw sqliteBusyError()
      })
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 1,
      lockRetryMaxDelayMs: 1,
      lockRetryJitter: false,
      onLockRetryDiagnostic: diagnostics,
    })

    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      operationClass: 'initialize SQLite adapter',
      attempt: 1,
      errorMessage: 'database is locked',
    }))
    expect(execMock).toHaveBeenCalledTimes(1)
    adapter.close()
  })

  it('closes an opened database handle if initialization exhausts lock retries', () => {
    pragmaMock
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw sqliteBusyError()
      })

    expect(() => new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 0,
      lockRetryBaseDelayMs: 1,
      lockRetryMaxDelayMs: 1,
      lockRetryJitter: false,
    })).toThrow(SQLiteLockRetryExhaustedError)
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('snapshots traces before queued writes observe later mutations', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (trace: unknown) => fn(trace))

    const adapter = new SQLiteAdapter('/tmp/traces.db')
    const trace = TraceContext.createTrace('original-goal')
    const span = TraceContext.startSpan(trace, { name: 'first' })
    TraceContext.endSpan(span)

    const flush = adapter.flush(trace)
    trace.goal = 'mutated-goal'
    span.metadata.changed = true
    await flush

    expect(upsertTraceRun).toHaveBeenCalledWith(expect.objectContaining({ goal: 'original-goal' }))
    expect(upsertSpanRun).toHaveBeenCalledWith(expect.objectContaining({ metadata: '{}' }))
  })

  it('flushes a batch in one SQLite transaction', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (traces: unknown) => fn(traces))

    const adapter = new SQLiteAdapter('/tmp/traces.db')
    const first = TraceContext.createTrace('first')
    const second = TraceContext.createTrace('second')

    await adapter.flushBatch([first, second])

    expect(transactionMock).toHaveBeenCalledOnce()
    expect(upsertTraceRun).toHaveBeenCalledTimes(2)
    expect(upsertTraceRun.mock.calls.map(call => call[0].goal)).toEqual(['first', 'second'])
  })

  it('retries transient SQLite lock failures with bounded backoff and diagnostics', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const diagnostics = vi.fn()
    prepareMock.mockReturnValue({ run: vi.fn() })
    let attempts = 0
    transactionMock.mockImplementation(fn => (trace: unknown) => {
      attempts += 1
      if (attempts <= 2) throw sqliteBusyError()
      return fn(trace)
    })

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 2,
      lockRetryBaseDelayMs: 10,
      lockRetryMaxDelayMs: 20,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
      onLockRetryDiagnostic: diagnostics,
    })
    const trace = TraceContext.createTrace('goal')
    const span = TraceContext.startSpan(trace, { name: 'first' })
    TraceContext.endSpan(span)

    await adapter.flush(trace)

    expect(sleep.mock.calls.map(call => call[0])).toEqual([10, 20])
    expect(diagnostics).toHaveBeenCalledTimes(2)
    expect(transactionMock).toHaveBeenCalledTimes(3)
  })

  it('keeps retry diagnostics best-effort when the diagnostic hook throws', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const diagnostics = vi.fn(() => {
      throw new Error('metrics sink down')
    })
    prepareMock.mockReturnValue({ run: vi.fn() })
    let attempts = 0
    transactionMock.mockImplementation(fn => (trace: unknown) => {
      attempts += 1
      if (attempts === 1) throw sqliteBusyError()
      return fn(trace)
    })

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 5,
      lockRetryMaxDelayMs: 5,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
      onLockRetryDiagnostic: diagnostics,
    })
    const trace = TraceContext.createTrace('goal')

    await adapter.flush(trace)

    expect(diagnostics).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(5)
    expect(transactionMock).toHaveBeenCalledTimes(2)
  })

  it('reports persistent SQLite locks with path, operation, elapsed time, and next action', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const diagnostics = vi.fn()
    transactionMock.mockImplementation(() => () => {
      throw sqliteBusyError()
    })

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 5,
      lockRetryMaxDelayMs: 5,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
      onLockRetryDiagnostic: diagnostics,
    })
    const trace = TraceContext.createTrace('goal')

    await expect(adapter.flush(trace)).rejects.toThrow(SQLiteLockRetryExhaustedError)
    await expect(adapter.flush(trace)).rejects.toThrow(/SQLite lock persisted for flush trace transaction on \/tmp\/traces\.db/)

    expect(sleep).toHaveBeenCalledWith(5)
    expect(diagnostics).toHaveBeenLastCalledWith(expect.objectContaining({
      dbPath: '/tmp/traces.db',
      operationClass: 'flush trace transaction',
      attempt: 2,
      maxRetries: 1,
      errorMessage: 'database is locked',
      nextAction: 'SQLite lock retry budget exhausted; inspect concurrent writers or increase busy timeout/retry budget.',
    }))
  })

  it('retries SQLite locks raised while preparing flush statements', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    const sleep = vi.fn().mockResolvedValue(undefined)
    prepareMock
      .mockImplementationOnce(() => {
        throw sqliteBusyError()
      })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (trace: unknown) => fn(trace))

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 5,
      lockRetryMaxDelayMs: 5,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
    })
    const trace = TraceContext.createTrace('goal')
    const span = TraceContext.startSpan(trace, { name: 'first' })
    TraceContext.endSpan(span)

    await adapter.flush(trace)

    expect(sleep).toHaveBeenCalledWith(5)
    expect(upsertTraceRun).toHaveBeenCalledTimes(1)
    expect(upsertSpanRun).toHaveBeenCalledTimes(1)
  })

  it('serializes flush retries so newer snapshots cannot overtake older retries', async () => {
    const releaseSleep: Array<() => void> = []
    const sleep = vi.fn().mockImplementation(() => new Promise<void>(resolve => releaseSleep.push(resolve)))
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    prepareMock.mockReturnValue({ run: vi.fn() })
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    let firstFlushAttempts = 0
    transactionMock.mockImplementation(fn => (trace: unknown) => {
      if (firstFlushAttempts < 1) {
        firstFlushAttempts += 1
        throw sqliteBusyError()
      }
      return fn(trace)
    })

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 5,
      lockRetryMaxDelayMs: 5,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
    })
    const trace = TraceContext.createTrace('goal')

    const firstFlush = adapter.flush(trace)
    const secondFlush = adapter.flush(trace)
    await Promise.resolve()

    expect(sleep).toHaveBeenCalledTimes(1)
    expect(upsertTraceRun).not.toHaveBeenCalled()

    releaseSleep[0]?.()
    await Promise.all([firstFlush, secondFlush])

    expect(upsertTraceRun).toHaveBeenCalledTimes(1)
    expect(prepareMock).toHaveBeenCalledTimes(6)
    expect(transactionMock).toHaveBeenCalledTimes(3)
  })

  it('serializes deletes behind pending flush retries', async () => {
    const releaseSleep: Array<() => void> = []
    const sleep = vi.fn().mockImplementation(() => new Promise<void>(resolve => releaseSleep.push(resolve)))
    const deleteSpansRun = vi.fn()
    const deleteTraceRun = vi.fn()
    prepareMock.mockReturnValue({ run: vi.fn() })
    prepareMock
      .mockReturnValueOnce({ run: vi.fn() })
      .mockReturnValueOnce({ run: vi.fn() })
      .mockReturnValueOnce({ run: vi.fn() })
      .mockReturnValueOnce({ run: vi.fn() })
      .mockReturnValueOnce({ run: deleteSpansRun })
      .mockReturnValueOnce({ run: deleteTraceRun })
    let transactionCalls = 0
    transactionMock.mockImplementation(fn => (arg: unknown) => {
      transactionCalls += 1
      if (transactionCalls === 1) throw sqliteBusyError()
      return fn(arg)
    })

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 5,
      lockRetryMaxDelayMs: 5,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
    })
    const trace = TraceContext.createTrace('goal')

    const flush = adapter.flush(trace)
    const deletion = adapter.deleteTrace(trace.id)
    await Promise.resolve()

    expect(deleteTraceRun).not.toHaveBeenCalled()
    releaseSleep[0]?.()
    await Promise.all([flush, deletion])

    expect(deleteSpansRun).toHaveBeenCalledWith(trace.id)
    expect(deleteTraceRun).toHaveBeenCalledWith(trace.id)
    expect(transactionMock).toHaveBeenCalledTimes(3)
  })

  it('drains pending writes before closing the SQLite handle', async () => {
    const upsertTraceRun = vi.fn()
    const upsertSpanRun = vi.fn()
    prepareMock
      .mockReturnValueOnce({ run: upsertTraceRun })
      .mockReturnValueOnce({ run: upsertSpanRun })
    transactionMock.mockImplementation(fn => (trace: unknown) => fn(trace))

    const adapter = new SQLiteAdapter('/tmp/traces.db')
    const trace = TraceContext.createTrace('goal')
    const span = TraceContext.startSpan(trace, { name: 'first' })
    TraceContext.endSpan(span)

    const flush = adapter.flush(trace)
    adapter.close()

    expect(closeMock).not.toHaveBeenCalled()
    await flush
    await Promise.resolve()

    expect(upsertTraceRun).toHaveBeenCalledWith(expect.objectContaining({ id: trace.id }))
    expect(closeMock).toHaveBeenCalledTimes(1)
    await expect(adapter.flush(trace)).rejects.toThrow('SQLiteAdapter is closed')
  })

  it('retries SQLite locks raised while preparing delete statements', async () => {
    const deleteSpansRun = vi.fn()
    const deleteTraceRun = vi.fn()
    const sleep = vi.fn().mockResolvedValue(undefined)
    prepareMock
      .mockImplementationOnce(() => {
        throw sqliteBusyError()
      })
      .mockReturnValueOnce({ run: deleteSpansRun })
      .mockReturnValueOnce({ run: deleteTraceRun })
    transactionMock.mockImplementation(fn => (traceId: unknown) => fn(traceId))

    const adapter = new SQLiteAdapter('/tmp/traces.db', {
      maxLockRetries: 1,
      lockRetryBaseDelayMs: 5,
      lockRetryMaxDelayMs: 5,
      lockRetryJitter: false,
      lockRetrySleep: sleep,
    })

    await adapter.deleteTrace('trace-1')

    expect(sleep).toHaveBeenCalledWith(5)
    expect(deleteSpansRun).toHaveBeenCalledWith('trace-1')
    expect(deleteTraceRun).toHaveBeenCalledWith('trace-1')
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
