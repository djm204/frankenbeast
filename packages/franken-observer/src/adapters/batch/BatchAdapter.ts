import type { Trace } from '../../core/types.js'
import type { ExportAdapter } from '../../export/ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from '../../export/ExportAdapter.js'

/** Bounded, payload-free context for a background drain notification. */
export interface BatchDrainContext {
  /** Number of traces included in the background drain attempt. */
  batchSize: number
  /** Unix timestamp in milliseconds when the background drain was attempted. */
  attemptedAt: number
}

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
  setInterval?: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>
  /** Injectable for testing. Defaults to `globalThis.clearInterval`. */
  clearInterval?: (id: ReturnType<typeof globalThis.setInterval>) => void
  /**
   * Best-effort observer for failed timer-triggered drains. The context is
   * bounded and intentionally excludes trace payloads and exporter errors.
   * Observer failures are ignored so they cannot interrupt future drains.
   */
  onDrainError?: (context: Readonly<BatchDrainContext>) => void
  /**
   * Best-effort observer invoked when a timer drain succeeds after one or more
   * failed timer drains. It receives the same bounded, payload-free context.
   */
  onDrainRecovery?: (context: Readonly<BatchDrainContext>) => void
}

function validatePositiveSafeInteger(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${optionName} must be a positive safe integer`)
  }
  return value
}

function setTimerRefState(
  timer: ReturnType<typeof globalThis.setInterval>,
  shouldRef: boolean,
): void {
  const refableTimer = timer as { ref?: () => void, unref?: () => void }
  if (shouldRef) refableTimer.ref?.()
  else refableTimer.unref?.()
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
  private timer: ReturnType<typeof globalThis.setInterval> | null = null
  private readonly clearIntervalFn: (id: ReturnType<typeof globalThis.setInterval>) => void
  private readonly onDrainError: ((context: Readonly<BatchDrainContext>) => void) | undefined
  private readonly onDrainRecovery: ((context: Readonly<BatchDrainContext>) => void) | undefined
  private backgroundDrainFailed = false
  private drainPromise: Promise<void> | null = null

  constructor(options: BatchAdapterOptions) {
    this.inner = options.adapter
    this.maxBatchSize = validatePositiveSafeInteger(options.maxBatchSize ?? 10, 'maxBatchSize')
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval
    this.onDrainError = options.onDrainError
    this.onDrainRecovery = options.onDrainRecovery

    if (options.flushIntervalMs !== undefined) {
      const flushIntervalMs = validatePositiveSafeInteger(options.flushIntervalMs, 'flushIntervalMs')
      const si = options.setInterval ?? globalThis.setInterval
      this.timer = si(() => {
        const context: BatchDrainContext = {
          batchSize: this.buffer.length,
          attemptedAt: Date.now(),
        }
        void this.drain().then(
          () => { this.reportDrainRecovery(context) },
          () => { this.reportDrainError(context) },
        )
      }, flushIntervalMs)
      setTimerRefState(this.timer, false)
    }
  }

  private reportDrainError(context: Readonly<BatchDrainContext>): void {
    this.backgroundDrainFailed = true
    try {
      this.onDrainError?.(context)
    } catch {
      // Background observers are best-effort and must not break future drains.
    }
  }

  private reportDrainRecovery(context: Readonly<BatchDrainContext>): void {
    if (!this.backgroundDrainFailed) return
    this.backgroundDrainFailed = false
    try {
      this.onDrainRecovery?.(context)
    } catch {
      // Recovery observers are also best-effort.
    }
  }

  /** Add a trace to the buffer. Drains immediately if `maxBatchSize` is reached. */
  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'BatchAdapter')
    const wasEmpty = this.buffer.length === 0
    this.buffer.push(trace)
    if (wasEmpty && this.timer !== null) setTimerRefState(this.timer, true)
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
      try {
        await this.drainBufferedTrace(triggerTrace)
      } catch (error) {
        if (this.buffer.includes(triggerTrace)) {
          throw error instanceof Error ? error : new Error(String(error))
        }
      }
      return
    }

    if (this.buffer.length >= this.maxBatchSize) await this.drain()
  }

  private async drainBufferedTrace(trace: Trace): Promise<void> {
    while (this.buffer.includes(trace)) {
      if (this.drainPromise !== null) {
        const activeDrain = this.drainPromise
        try {
          await activeDrain
        } catch {
          // This trace was queued after the failed drain, so its result is independent.
        }
        if (this.drainPromise === activeDrain) this.drainPromise = null
        continue
      }

      const followUpDrain = Promise.resolve().then(() => this.drainBufferedTraces([trace]))
      this.drainPromise = followUpDrain
      try {
        await followUpDrain
      } finally {
        if (this.drainPromise === followUpDrain) this.drainPromise = null
      }
    }
  }

  private async drainBufferedTraces(batch: Trace[]): Promise<void> {
    if (batch.length === 0) return

    if (this.inner.flushBatch !== undefined) {
      await this.inner.flushBatch(batch)
      for (const trace of batch) {
        const index = this.buffer.indexOf(trace)
        if (index !== -1) this.buffer.splice(index, 1)
      }
      if (this.buffer.length === 0 && this.timer !== null) setTimerRefState(this.timer, false)
      return
    }

    const results = await Promise.allSettled(batch.map(t => this.inner.flush(t)))
    const failures: unknown[] = []

    const latestSucceededIndexByTraceId = new Map<string, number>()
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.status === 'fulfilled') latestSucceededIndexByTraceId.set(batch[i]!.id, i)
    }

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!
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

    if (this.buffer.length === 0 && this.timer !== null) setTimerRefState(this.timer, false)

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
