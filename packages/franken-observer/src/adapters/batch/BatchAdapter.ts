import type { Trace } from '../../core/types.js'
import type { ExportAdapter } from '../../export/ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from '../../export/ExportAdapter.js'

export interface BatchAdapterOptions {
  /** Underlying adapter that receives traces when the batch is drained. */
  adapter: ExportAdapter
  /**
   * Maximum number of traces to buffer before triggering an automatic drain.
   * Default: `10`.
   */
  maxBatchSize?: number
  /**
   * If set to a positive number, a periodic timer drains the buffer every
   * `flushIntervalMs` milliseconds regardless of batch size. Useful as a
   * safety net so traces are never held for more than one interval period.
   * Default: no timer.
   */
  flushIntervalMs?: number
  /** Injectable for testing. Defaults to `globalThis.setInterval`. */
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>
  /** Injectable for testing. Defaults to `globalThis.clearInterval`. */
  clearInterval?: (id: ReturnType<typeof setInterval>) => void
}

/**
 * Buffers `flush()` calls and forwards them to the underlying adapter in bulk,
 * reducing HTTP round-trips on high-throughput deployments.
 *
 * Drain triggers:
 *  1. **Size trigger** — buffer reaches `maxBatchSize` (default 10)
 *  2. **Time trigger** — periodic `flushIntervalMs` timer fires (if configured)
 *  3. **Manual** — explicit `drain()` call
 *  4. **Shutdown** — `stop()` drains and cancels any timer
 *
 * `queryByTraceId` and `listTraceIds` see both the in-flight buffer and the
 * already-persisted inner adapter, so no trace is temporarily invisible.
 *
 * ```ts
 * const adapter = new BatchAdapter({
 *   adapter: langfuseAdapter,
 *   maxBatchSize: 20,
 *   flushIntervalMs: 10_000, // also drain every 10 s
 * })
 * // later, at shutdown:
 * await adapter.stop()
 * ```
 */
export class BatchAdapter implements ExportAdapter {
  private readonly inner: ExportAdapter
  private readonly maxBatchSize: number
  private readonly buffer: Trace[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly clearIntervalFn: (id: ReturnType<typeof setInterval>) => void
  private drainPromise: Promise<void> | null = null

  constructor(options: BatchAdapterOptions) {
    this.inner = options.adapter
    this.maxBatchSize = options.maxBatchSize ?? 10
    this.clearIntervalFn = options.clearInterval ?? clearInterval

    if (options.flushIntervalMs && options.flushIntervalMs > 0) {
      const si = options.setInterval ?? setInterval
      this.timer = si(() => { void this.drain().catch(() => undefined) }, options.flushIntervalMs)
    }
  }

  /** Add a trace to the buffer. Drains immediately if `maxBatchSize` is reached. */
  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'BatchAdapter')
    this.buffer.push(trace)
    if (this.buffer.length >= this.maxBatchSize) {
      await this.drainForSizeTriggeredFlush(trace)
    }
  }

  /**
   * Forwards all buffered traces to the inner adapter in parallel and clears
   * only successfully persisted traces from the buffer. Safe to call on an
   * empty buffer (no-op).
   */
  async drain(): Promise<void> {
    if (this.drainPromise !== null) {
      const currentDrain = this.drainPromise
      let currentFailure: unknown = null
      try {
        await currentDrain
      } catch (error) {
        currentFailure = error
      }
      if (this.buffer.length > 0) {
        await this.drain()
        return
      }
      if (currentFailure !== null) {
        throw currentFailure instanceof Error ? currentFailure : new Error(String(currentFailure))
      }
      return
    }

    const batch = [...this.buffer]
    const currentDrain = Promise.resolve().then(() => this.drainBufferedTraces(batch))
    this.drainPromise = currentDrain
    try {
      await currentDrain
    } finally {
      if (this.drainPromise === currentDrain) this.drainPromise = null
    }
  }

  private async drainForSizeTriggeredFlush(triggerTrace: Trace): Promise<void> {
    if (this.drainPromise === null) {
      await this.drain()
      return
    }

    const currentDrain = this.drainPromise
    try {
      await currentDrain
    } catch {
      if (this.buffer.length > 0) {
        try {
          await this.drain()
        } catch (error) {
          if (this.buffer.includes(triggerTrace)) {
            throw error instanceof Error ? error : new Error(String(error))
          }
        }
      }
      return
    }

    if (this.buffer.length >= this.maxBatchSize) await this.drain()
  }

  private async drainBufferedTraces(batch: Trace[]): Promise<void> {
    if (batch.length === 0) return

    const results = await Promise.allSettled(batch.map(t => this.inner.flush(t)))
    const failures: unknown[] = []

    const latestSucceededIndexByTraceId = new Map<string, number>()
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.status === 'fulfilled') latestSucceededIndexByTraceId.set(batch[i]!.id, i)
    }

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const trace = batch[i]!
      if (result.status === 'fulfilled') {
        const index = this.buffer.indexOf(trace)
        if (index !== -1) this.buffer.splice(index, 1)
      } else {
        const latestSucceededIndex = latestSucceededIndexByTraceId.get(trace.id)
        if (latestSucceededIndex !== undefined && latestSucceededIndex > i) {
          const index = this.buffer.indexOf(trace)
          if (index !== -1) this.buffer.splice(index, 1)
          continue
        }
        failures.push(result.reason)
      }
    }

    if (failures.length > 0) {
      const firstFailure = failures[0]
      throw firstFailure instanceof Error ? firstFailure : new Error(String(firstFailure))
    }
  }

  /**
   * Cancels the periodic timer (if any) and drains any remaining buffered
   * traces. Call this during graceful shutdown to avoid losing buffered data.
   */
  async stop(): Promise<void> {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer)
      this.timer = null
    }
    await this.drain()
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    const buffered = this.buffer.find(t => t.id === traceId)
    if (buffered !== undefined) return buffered
    return this.inner.queryByTraceId(traceId)
  }

  async listTraceIds(): Promise<string[]> {
    const bufferedIds = this.buffer.map(t => t.id)
    const innerIds = await this.inner.listTraceIds()
    return [...new Set([...bufferedIds, ...innerIds])]
  }
}
