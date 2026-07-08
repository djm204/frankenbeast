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

  it('configures a busy timeout so concurrent writers wait for locks', () => {
    const adapter = new SQLiteAdapter('/tmp/traces.db')

    expect(Database).toHaveBeenCalledWith('/tmp/traces.db')
    expect(pragmaMock).toHaveBeenCalledWith('busy_timeout = 5000')

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

    const second = TraceContext.startSpan(trace, { name: 'second' })
    SpanLifecycle.setMetadata(second, { step: 2 })
    TraceContext.endSpan(second)
    await adapter.flush(trace)

    expect(upsertSpanRun).toHaveBeenCalledTimes(2)
    expect(upsertSpanRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: second.id, metadata: JSON.stringify({ step: 2 }) }),
    )
  })
})
