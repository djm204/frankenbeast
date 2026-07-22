import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type WorkerEvent = 'message' | 'error' | 'exit'
type WorkerListener = (...args: unknown[]) => void

const workerMocks = vi.hoisted(() => {
  const instances: Array<{
    listeners: Map<WorkerEvent, WorkerListener[]>
    on: ReturnType<typeof vi.fn>
    postMessage: ReturnType<typeof vi.fn>
    ref: ReturnType<typeof vi.fn>
    unref: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
    emit: (event: WorkerEvent, ...args: unknown[]) => void
  }> = []

  return {
    instances,
    create() {
      const listeners = new Map<WorkerEvent, WorkerListener[]>()
      const worker = {
        listeners,
        on: vi.fn((event: WorkerEvent, listener: WorkerListener) => {
          const registered = listeners.get(event) ?? []
          registered.push(listener)
          listeners.set(event, registered)
          return worker
        }),
        postMessage: vi.fn(),
        ref: vi.fn(),
        unref: vi.fn(),
        terminate: vi.fn().mockResolvedValue(1),
        emit(event: WorkerEvent, ...args: unknown[]) {
          for (const listener of listeners.get(event) ?? []) listener(...args)
        },
      }
      instances.push(worker)
      return worker
    },
  }
})

const databaseMocks = vi.hoisted(() => ({
  close: vi.fn(),
  pragma: vi.fn((statement: string) => statement === "index_list('traces')"
    ? [{ name: 'idx_traces_startedAt' }]
    : undefined),
  exec: vi.fn(),
}))

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(function MockWorker() {
    return workerMocks.create()
  }),
}))

vi.mock('better-sqlite3', () => ({
  default: vi.fn(function MockDatabase() {
    return {
      pragma: databaseMocks.pragma,
      exec: databaseMocks.exec,
      close: databaseMocks.close,
    }
  }),
}))

import { SQLiteAdapter } from './SQLiteAdapter.js'

describe('SQLiteAdapter worker close lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workerMocks.instances.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns one idempotent promise and resolves it from the close response', async () => {
    const adapter = new SQLiteAdapter('/tmp/worker-close.db')
    const worker = workerMocks.instances[0]!

    const first = adapter.close()
    const second = adapter.close()

    expect(second).toBe(first)
    expect(worker.ref).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    const request = worker.postMessage.mock.calls[0]![0] as { id: number; operation: string }
    expect(request.operation).toBe('close')

    worker.emit('message', { id: request.id })
    await expect(first).resolves.toBeUndefined()

    expect(worker.unref).toHaveBeenCalled()
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(databaseMocks.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a bounded close timeout, terminates the worker, and unrefs it', async () => {
    vi.useFakeTimers()
    const adapter = new SQLiteAdapter('/tmp/worker-close-timeout.db', { busyTimeoutMs: 1 })
    const worker = workerMocks.instances[0]!

    const close = adapter.close()
    const rejected = expect(close).rejects.toThrow('Timed out closing SQLite worker after 1001ms')
    await vi.advanceTimersByTimeAsync(1001)
    await rejected

    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.unref).toHaveBeenCalled()
    expect(databaseMocks.close).toHaveBeenCalledTimes(1)
  })

  it('settles close and every pending request once on worker error', async () => {
    const adapter = new SQLiteAdapter('/tmp/worker-close-error.db')
    const worker = workerMocks.instances[0]!
    const client = (adapter as unknown as {
      workerClient: { request<T>(operation: string): Promise<T>; close(): Promise<void> }
    }).workerClient
    const requestRejected = vi.fn()
    const closeRejected = vi.fn()
    const request = client.request<string[]>('listTraceIds').catch(requestRejected)
    const close = client.close().catch(closeRejected)

    worker.emit('error', new Error('worker crashed'))
    worker.emit('error', new Error('duplicate error'))
    await Promise.all([request, close])

    expect(requestRejected).toHaveBeenCalledTimes(1)
    expect(requestRejected).toHaveBeenCalledWith(expect.objectContaining({ message: 'worker crashed' }))
    expect(closeRejected).toHaveBeenCalledTimes(1)
    expect(closeRejected).toHaveBeenCalledWith(expect.objectContaining({ message: 'worker crashed' }))
    await expect(adapter.close()).rejects.toThrow('worker crashed')
    expect(databaseMocks.close).toHaveBeenCalledTimes(1)
  })

  it('settles close and every pending request once on unexpected worker exit', async () => {
    const adapter = new SQLiteAdapter('/tmp/worker-close-exit.db')
    const worker = workerMocks.instances[0]!
    const client = (adapter as unknown as {
      workerClient: { request<T>(operation: string): Promise<T>; close(): Promise<void> }
    }).workerClient
    const requestRejected = vi.fn()
    const closeRejected = vi.fn()
    const request = client.request<string[]>('listTraceIds').catch(requestRejected)
    const close = client.close().catch(closeRejected)

    worker.emit('exit', 2)
    worker.emit('exit', 3)
    await Promise.all([request, close])

    expect(requestRejected).toHaveBeenCalledTimes(1)
    expect(requestRejected).toHaveBeenCalledWith(expect.objectContaining({
      message: 'SQLite worker exited with code 2 before acknowledging close',
    }))
    expect(closeRejected).toHaveBeenCalledTimes(1)
    expect(closeRejected).toHaveBeenCalledWith(expect.objectContaining({
      message: 'SQLite worker exited with code 2 before acknowledging close',
    }))
    await expect(adapter.close()).rejects.toThrow('SQLite worker exited with code 2 before acknowledging close')
    expect(databaseMocks.close).toHaveBeenCalledTimes(1)
  })
})
