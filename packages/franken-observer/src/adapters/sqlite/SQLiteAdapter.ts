import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Trace, Span } from '../../core/types.js'
import type { ExportAdapter, TraceSummary } from '../../export/ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from '../../export/ExportAdapter.js'
import {
  CREATE_TABLES,
  UPSERT_TRACE,
  UPSERT_SPAN,
  SELECT_TRACE,
  SELECT_SPANS,
  SELECT_ALL_TRACE_IDS,
  SELECT_TRACE_SUMMARIES,
  DELETE_SPANS_BY_TRACE,
  DELETE_TRACE,
} from './schema.js'

interface TraceRow {
  id: string
  goal: string
  status: string
  startedAt: number
  endedAt: number | null
}

interface SpanRow {
  id: string
  traceId: string
  parentSpanId: string | null
  name: string
  status: string
  startedAt: number
  endedAt: number | null
  durationMs: number | null
  errorMessage: string | null
  metadata: string
  thoughtBlocks: string
}

interface TraceSummaryRow {
  id: string
  goal: string
  status: string
  startedAt: number
  spanCount: number
}

interface FlushedSpanState {
  status: Span['status']
  endedAt?: number
  durationMs?: number
  errorMessage?: string
  metadata: Record<string, unknown>
  metadataKeyCount: number
  metadataJson: string
  thoughtBlocks: string[]
  thoughtBlockCount: number
  thoughtBlocksJson: string
}

export interface SQLiteAdapterOptions {
  /** Maximum flushed-span snapshots retained for repeated-flush dirty checks. */
  maxFlushedSpanSnapshots?: number
  /** SQLite busy timeout in milliseconds. Default: 5000. */
  busyTimeoutMs?: number
  /** Bounded retries after SQLite reports busy/locked. Default: 3. */
  maxLockRetries?: number
  /** Base delay in milliseconds for lock retry backoff. Default: 25. */
  lockRetryBaseDelayMs?: number
  /** Max delay in milliseconds for lock retry backoff. Default: 250. */
  lockRetryMaxDelayMs?: number
  /** Add random jitter up to the base delay. Default: true. */
  lockRetryJitter?: boolean
  /** Injectable sleep for tests. */
  lockRetrySleep?: (ms: number) => Promise<void>
  /** Receives retry and exhaustion diagnostics without exposing row payloads. */
  onLockRetryDiagnostic?: (diagnostic: SQLiteLockRetryDiagnostic) => void
}

export interface SQLiteLockRetryDiagnostic {
  dbPath: string
  operationClass: string
  attempt: number
  maxRetries: number
  elapsedMs: number
  nextDelayMs?: number
  errorMessage: string
  nextAction: string
}

export class SQLiteLockRetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly diagnostic: SQLiteLockRetryDiagnostic,
    public override readonly cause: unknown,
  ) {
    super(message)
    this.name = 'SQLiteLockRetryExhaustedError'
  }
}

interface NormalizedLockRetryOptions {
  busyTimeoutMs: number
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitter: boolean
  sleep: (ms: number) => Promise<void>
  onDiagnostic?: (diagnostic: SQLiteLockRetryDiagnostic) => void
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number, name: string, max: number): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}`)
  }
  return resolved
}

function normalizePositiveInteger(value: number | undefined, fallback: number, name: string, max: number): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`)
  }
  return resolved
}

function normalizeLockRetryOptions(options: SQLiteAdapterOptions): NormalizedLockRetryOptions {
  const busyTimeoutMs = normalizePositiveInteger(options.busyTimeoutMs, 5_000, 'busyTimeoutMs', 60_000)
  const maxRetries = normalizeNonNegativeInteger(options.maxLockRetries, 3, 'maxLockRetries', 10)
  const baseDelayMs = normalizePositiveInteger(options.lockRetryBaseDelayMs, 25, 'lockRetryBaseDelayMs', 60_000)
  const maxDelayMs = normalizePositiveInteger(options.lockRetryMaxDelayMs, 250, 'lockRetryMaxDelayMs', 60_000)
  if (baseDelayMs > maxDelayMs) {
    throw new Error('lockRetryBaseDelayMs must be less than or equal to lockRetryMaxDelayMs')
  }
  return {
    busyTimeoutMs,
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    jitter: options.lockRetryJitter ?? true,
    sleep: options.lockRetrySleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms))),
    onDiagnostic: options.onLockRetryDiagnostic,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isSqliteLockError(error: unknown): boolean {
  const maybe = error as { code?: unknown }
  const code = typeof maybe?.code === 'string' ? maybe.code : ''
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') return true
  return /database is (?:busy|locked)|SQLITE_(?:BUSY|LOCKED)/i.test(errorMessage(error))
}

/**
 * Parse a JSON column, returning a fallback instead of throwing when the
 * stored value is corrupt. A single bad row must not poison the whole trace
 * query — the span is still returned, just with empty metadata/thoughtBlocks.
 */
function safeParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    console.warn(`[SQLiteAdapter] Skipping corrupt JSON in ${context}; using fallback`)
    return fallback
  }
}

function rowToSpan(row: SpanRow): Span {
  return {
    id: row.id,
    traceId: row.traceId,
    parentSpanId: row.parentSpanId ?? undefined,
    name: row.name,
    status: row.status as Span['status'],
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? undefined,
    durationMs: row.durationMs ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    metadata: safeParse<Record<string, unknown>>(row.metadata, {}, `span ${row.id} metadata`),
    thoughtBlocks: safeParse<string[]>(row.thoughtBlocks, [], `span ${row.id} thoughtBlocks`),
  }
}

/**
 * Persistent SQLite-backed export adapter.
 * Uses WAL journal mode for safe concurrent reads and batched
 * transactions for multi-span flushes.
 */
export class SQLiteAdapter implements ExportAdapter {
  private readonly db: Database.Database
  private readonly maxFlushedSpanSnapshots: number
  private readonly lockRetry: NormalizedLockRetryOptions
  private readonly filePath: string
  private readonly flushedSpans = new Map<string, Map<string, FlushedSpanState>>()
  private flushedSpanSnapshotCount = 0

  constructor(filePath: string, options: SQLiteAdapterOptions = {}) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.db = new Database(filePath)
    this.filePath = filePath
    this.lockRetry = normalizeLockRetryOptions(options)
    this.maxFlushedSpanSnapshots = Math.max(
      0,
      Math.floor(options.maxFlushedSpanSnapshots ?? 10_000),
    )
    this.db.pragma(`busy_timeout = ${this.lockRetry.busyTimeoutMs}`)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(CREATE_TABLES)
  }

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'SQLiteAdapter')
    const upsertTrace = this.db.prepare(UPSERT_TRACE)
    const upsertSpan = this.db.prepare(UPSERT_SPAN)
    const flushedInTransaction: Span[] = []

    const transaction = this.db.transaction((t: Trace) => {
      upsertTrace.run({
        id: t.id,
        goal: t.goal,
        status: t.status,
        startedAt: t.startedAt,
        endedAt: t.endedAt ?? null,
      })
      for (const span of t.spans) {
        if (!this.shouldFlushSpan(span)) continue

        upsertSpan.run({
          id: span.id,
          traceId: span.traceId,
          parentSpanId: span.parentSpanId ?? null,
          name: span.name,
          status: span.status,
          startedAt: span.startedAt,
          endedAt: span.endedAt ?? null,
          durationMs: span.durationMs ?? null,
          errorMessage: span.errorMessage ?? null,
          metadata: JSON.stringify(span.metadata),
          thoughtBlocks: JSON.stringify(span.thoughtBlocks),
        })
        flushedInTransaction.push(span)
      }
    })

    await this.withSqliteLockRetry('flush trace transaction', () => transaction(trace))
    for (const span of flushedInTransaction) {
      this.rememberFlushedSpan(span)
    }
  }

  private shouldFlushSpan(span: Span): boolean {
    const byTrace = this.flushedSpans.get(span.traceId)
    const previous = byTrace?.get(span.id)
    if (previous === undefined) return true

    // Active spans are still mutable: metadata/thought blocks can grow and the
    // eventual endSpan() call changes status/timing. Re-flush them while active.
    if (span.status === 'active') return true

    if (
      previous.status !== span.status ||
      previous.endedAt !== span.endedAt ||
      previous.durationMs !== span.durationMs ||
      previous.errorMessage !== span.errorMessage
    ) {
      return true
    }

    return this.metadataChanged(previous, span) || this.thoughtBlocksChanged(previous, span)
  }

  private metadataChanged(previous: FlushedSpanState, span: Span): boolean {
    return previous.metadataJson !== JSON.stringify(span.metadata)
  }

  private thoughtBlocksChanged(previous: FlushedSpanState, span: Span): boolean {
    return previous.thoughtBlocksJson !== JSON.stringify(span.thoughtBlocks)
  }

  private rememberFlushedSpan(span: Span): void {
    if (this.maxFlushedSpanSnapshots === 0) return

    let byTrace = this.flushedSpans.get(span.traceId)
    if (byTrace === undefined) {
      byTrace = new Map<string, FlushedSpanState>()
      this.flushedSpans.set(span.traceId, byTrace)
    }
    if (!byTrace.has(span.id)) {
      this.flushedSpanSnapshotCount += 1
    }
    byTrace.set(span.id, {
      status: span.status,
      endedAt: span.endedAt,
      durationMs: span.durationMs,
      errorMessage: span.errorMessage,
      metadata: span.metadata,
      metadataKeyCount: Object.keys(span.metadata).length,
      metadataJson: JSON.stringify(span.metadata),
      thoughtBlocks: span.thoughtBlocks,
      thoughtBlockCount: span.thoughtBlocks.length,
      thoughtBlocksJson: JSON.stringify(span.thoughtBlocks),
    })
    this.pruneFlushedSpanSnapshots(span.traceId)
  }

  private pruneFlushedSpanSnapshots(currentTraceId: string): void {
    while (this.flushedSpanSnapshotCount > this.maxFlushedSpanSnapshots) {
      const oldestTraceId = this.flushedSpans.keys().next().value as string | undefined
      if (oldestTraceId === undefined) break

      // Do not evict snapshots for the trace currently being flushed: doing so
      // would make a large retry walk miss the next span and re-upsert the trace.
      // Prune older trace groups first; a single large current trace may exceed
      // the cap until the adapter sees another trace.
      if (oldestTraceId === currentTraceId) {
        if (this.flushedSpans.size === 1) break
        const current = this.flushedSpans.get(oldestTraceId)
        this.flushedSpans.delete(oldestTraceId)
        this.flushedSpans.set(oldestTraceId, current ?? new Map<string, FlushedSpanState>())
        continue
      }

      const pruned = this.flushedSpans.get(oldestTraceId)
      this.flushedSpanSnapshotCount -= pruned?.size ?? 0
      this.flushedSpans.delete(oldestTraceId)
    }
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.withSqliteLockRetry('query trace by id', () => {
      const traceRow = this.db.prepare(SELECT_TRACE).get(traceId) as TraceRow | undefined
      if (traceRow === undefined) return null

      const spanRows = this.db.prepare(SELECT_SPANS).all(traceId) as SpanRow[]

      return {
        id: traceRow.id,
        goal: traceRow.goal,
        status: traceRow.status as Trace['status'],
        startedAt: traceRow.startedAt,
        endedAt: traceRow.endedAt ?? undefined,
        spans: spanRows.map(rowToSpan),
      }
    })
  }

  async listTraceIds(): Promise<string[]> {
    return this.withSqliteLockRetry('list trace ids', () => {
      const rows = this.db.prepare(SELECT_ALL_TRACE_IDS).all() as { id: string }[]
      return rows.map(r => r.id)
    })
  }

  async listTraceSummaries(): Promise<TraceSummary[]> {
    return this.withSqliteLockRetry('list trace summaries', () => {
      const rows = this.db.prepare(SELECT_TRACE_SUMMARIES).all() as TraceSummaryRow[]
      return rows.map(row => ({
        id: row.id,
        goal: row.goal,
        status: row.status as Trace['status'],
        spanCount: row.spanCount,
        startedAt: row.startedAt,
      }))
    })
  }

  async deleteTrace(traceId: string): Promise<void> {
    const deleteSpans = this.db.prepare(DELETE_SPANS_BY_TRACE)
    const deleteTrace = this.db.prepare(DELETE_TRACE)
    const transaction = this.db.transaction((id: string) => {
      deleteSpans.run(id)
      deleteTrace.run(id)
    })

    await this.withSqliteLockRetry('delete trace transaction', () => transaction(traceId))
    const flushed = this.flushedSpans.get(traceId)
    if (flushed !== undefined) {
      this.flushedSpanSnapshotCount -= flushed.size
      this.flushedSpans.delete(traceId)
    }
  }

  private async withSqliteLockRetry<T>(operationClass: string, action: () => T): Promise<T> {
    const startedAt = Date.now()
    for (let attempt = 0; ; attempt += 1) {
      try {
        return action()
      } catch (error) {
        if (!isSqliteLockError(error)) {
          throw error
        }

        const elapsedMs = Date.now() - startedAt
        const exhausted = attempt >= this.lockRetry.maxRetries
        const nextDelayMs = exhausted ? undefined : this.nextLockRetryDelay(attempt)
        const diagnostic: SQLiteLockRetryDiagnostic = {
          dbPath: this.filePath,
          operationClass,
          attempt: attempt + 1,
          maxRetries: this.lockRetry.maxRetries,
          elapsedMs,
          ...(nextDelayMs === undefined ? {} : { nextDelayMs }),
          errorMessage: errorMessage(error),
          nextAction: exhausted
            ? 'SQLite lock retry budget exhausted; inspect concurrent writers or increase busy timeout/retry budget.'
            : 'Retrying SQLite operation after bounded backoff.',
        }
        this.lockRetry.onDiagnostic?.(diagnostic)

        if (exhausted) {
          throw new SQLiteLockRetryExhaustedError(
            `[SQLiteAdapter] SQLite lock persisted for ${operationClass} on ${this.filePath} after ${attempt + 1} attempts over ${elapsedMs}ms. Next action: ${diagnostic.nextAction}`,
            diagnostic,
            error,
          )
        }

        await this.lockRetry.sleep(nextDelayMs ?? 0)
      }
    }
  }

  private nextLockRetryDelay(attempt: number): number {
    const base = Math.min(this.lockRetry.baseDelayMs * 2 ** attempt, this.lockRetry.maxDelayMs)
    if (!this.lockRetry.jitter) return base
    return Math.min(base + Math.random() * this.lockRetry.baseDelayMs, this.lockRetry.maxDelayMs)
  }

  /** Release the DB connection. Call when shutting down. */
  close(): void {
    this.db.close()
  }
}
