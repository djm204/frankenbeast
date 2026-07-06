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
})
