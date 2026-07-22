import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
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
  endedAt: number | undefined
  durationMs: number | undefined
  errorMessage: string | undefined
  metadata: Record<string, unknown>
  metadataKeyCount: number
  metadataJson: string
  thoughtBlocks: string[]
  thoughtBlockCount: number
  thoughtBlocksJson: string
}

const SQLITE_SCHEMA_SENTINEL_INDEX = 'idx_traces_startedAt'

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
  /** Run async SQLite interface operations on a worker thread. Default: true. */
  useWorkerThread?: boolean
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

type SQLiteWorkerOperation = 'flush' | 'queryByTraceId' | 'listTraceIds' | 'listTraceSummaries' | 'deleteTrace'

interface SQLiteWorkerResponse {
  id: number
  result?: unknown
  error?: { message: string; code?: string }
}

interface SQLiteWorkerQueryResult {
  traceRow?: TraceRow
  spanRows: SpanRow[]
}

const SQLITE_WORKER_SOURCE = String.raw`
;(async () => {
const { parentPort, workerData } = await import('node:worker_threads')
const { default: Database } = await import(workerData.betterSqlite3Url)
const db = new Database(workerData.filePath)
db.pragma('busy_timeout = ' + workerData.busyTimeoutMs)
db.pragma('foreign_keys = ON')

function execute(operation, payload) {
  const sql = workerData.sql
  switch (operation) {
    case 'flush': {
      const upsertTrace = db.prepare(sql.upsertTrace)
      const upsertSpan = db.prepare(sql.upsertSpan)
      const transaction = db.transaction((traces) => {
        for (const trace of traces) {
          upsertTrace.run({
            id: trace.id,
            goal: trace.goal,
            status: trace.status,
            startedAt: trace.startedAt,
            endedAt: trace.endedAt ?? null,
          })
          for (const span of trace.spans) {
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
              metadata: span.metadataJson,
              thoughtBlocks: span.thoughtBlocksJson,
            })
          }
        }
      })
      transaction(payload.traces)
      return undefined
    }
    case 'queryByTraceId': {
      const traceRow = db.prepare(sql.selectTrace).get(payload.traceId)
      if (traceRow === undefined) return { spanRows: [] }
      const spanRows = db.prepare(sql.selectSpans).all(payload.traceId)
      return { traceRow, spanRows }
    }
    case 'listTraceIds':
      return db.prepare(sql.selectAllTraceIds).all().map((row) => row.id)
    case 'listTraceSummaries':
      return db.prepare(sql.selectTraceSummaries).all()
    case 'deleteTrace': {
      const deleteSpans = db.prepare(sql.deleteSpansByTrace)
      const deleteTrace = db.prepare(sql.deleteTrace)
      db.transaction((traceId) => {
        deleteSpans.run(traceId)
        deleteTrace.run(traceId)
      })(payload.traceId)
      return undefined
    }
    default:
      throw new Error('Unknown SQLite worker operation: ' + operation)
  }
}

parentPort.on('message', ({ id, operation, payload }) => {
  if (operation === 'close') {
    try {
      db.close()
      parentPort.postMessage({ id })
    } catch (error) {
      parentPort.postMessage({
        id,
        error: {
          message: error instanceof Error ? error.message : String(error),
          ...(typeof error?.code === 'string' ? { code: error.code } : {}),
        },
      })
    }
    parentPort.close()
    return
  }
  try {
    parentPort.postMessage({ id, result: execute(operation, payload) })
  } catch (error) {
    parentPort.postMessage({
      id,
      error: {
        message: error instanceof Error ? error.message : String(error),
        ...(typeof error?.code === 'string' ? { code: error.code } : {}),
      },
    })
  }
})
})().catch((error) => { throw error })
`

class SQLiteWorkerClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private nextId = 1
  private closed = false
  private failure: Error | undefined
  private readonly closeTimeoutMs: number
  private closePromise: Promise<void> | undefined
  private closeRequestId: number | undefined
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  private resolveClose: (() => void) | undefined
  private rejectClose: ((error: Error) => void) | undefined

  constructor(filePath: string, busyTimeoutMs: number) {
    const require = createRequire(import.meta.url)
    this.closeTimeoutMs = busyTimeoutMs + 1_000
    this.worker = new Worker(
      new URL(`data:text/javascript,${encodeURIComponent(SQLITE_WORKER_SOURCE)}`),
      {
        workerData: {
          filePath,
          busyTimeoutMs,
          betterSqlite3Url: pathToFileURL(require.resolve('better-sqlite3')).href,
          sql: {
            upsertTrace: UPSERT_TRACE,
            upsertSpan: UPSERT_SPAN,
            selectTrace: SELECT_TRACE,
            selectSpans: SELECT_SPANS,
            selectAllTraceIds: SELECT_ALL_TRACE_IDS,
            selectTraceSummaries: SELECT_TRACE_SUMMARIES,
            deleteSpansByTrace: DELETE_SPANS_BY_TRACE,
            deleteTrace: DELETE_TRACE,
          },
        },
      },
    )
    this.worker.on('message', (response: SQLiteWorkerResponse) => this.handleResponse(response))
    this.worker.on('error', error => this.handleWorkerFailure(
      error instanceof Error ? error : new Error(String(error)),
    ))
    this.worker.on('exit', code => this.handleWorkerExit(code))
    this.worker.unref()
  }

  request<T>(operation: SQLiteWorkerOperation, payload: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error('SQLiteAdapter is closed'))
    if (this.failure !== undefined) return Promise.reject(this.failure)
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
      })
      this.worker.ref()
      try {
        this.worker.postMessage({ id, operation, payload })
      } catch (error) {
        this.pending.delete(id)
        if (this.pending.size === 0) this.worker.unref()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise
    this.closed = true
    if (this.failure !== undefined) {
      this.closePromise = this.worker.terminate()
        .then(() => undefined)
        .finally(() => this.worker.unref())
      return this.closePromise
    }
    this.worker.ref()
    this.closeRequestId = this.nextId++
    this.closePromise = new Promise<void>((resolve, reject) => {
      this.resolveClose = resolve
      this.rejectClose = reject
    })
    this.closeTimer = setTimeout(() => {
      const error = new Error(`Timed out closing SQLite worker after ${this.closeTimeoutMs}ms`)
      this.rejectPending(error)
      this.settleClose(error)
      this.worker.unref()
      void this.worker.terminate()
    }, this.closeTimeoutMs)
    try {
      this.worker.postMessage({
        id: this.closeRequestId,
        operation: 'close',
        payload: {},
      })
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      this.rejectPending(error)
      this.settleClose(error)
      this.worker.unref()
      void this.worker.terminate()
    }
    return this.closePromise
  }

  private handleResponse(response: SQLiteWorkerResponse): void {
    if (response.id === this.closeRequestId) {
      if (response.error === undefined) {
        this.settleClose()
      } else {
        const error = this.workerResponseError(response.error)
        this.rejectPending(error)
        this.settleClose(error)
      }
      return
    }
    const pending = this.pending.get(response.id)
    if (pending === undefined) return
    this.pending.delete(response.id)
    if (this.pending.size === 0) this.worker.unref()
    if (response.error === undefined) {
      pending.resolve(response.result)
      return
    }
    pending.reject(this.workerResponseError(response.error))
  }

  private workerResponseError(response: NonNullable<SQLiteWorkerResponse['error']>): Error {
    const error = new Error(response.message) as Error & { code?: string }
    if (response.code !== undefined) error.code = response.code
    return error
  }

  private handleWorkerFailure(error: Error): void {
    this.rejectPending(error)
    this.settleClose(error)
  }

  private handleWorkerExit(code: number): void {
    if (this.resolveClose === undefined && this.rejectClose === undefined) {
      if (!this.closed) this.rejectPending(new Error(`SQLite worker exited with code ${code}`))
      return
    }
    const error = new Error(`SQLite worker exited with code ${code} before acknowledging close`)
    this.rejectPending(error)
    this.settleClose(error)
  }

  private settleClose(error?: Error): void {
    const resolve = this.resolveClose
    const reject = this.rejectClose
    if (resolve === undefined || reject === undefined) return
    this.resolveClose = undefined
    this.rejectClose = undefined
    this.closeRequestId = undefined
    if (this.closeTimer !== undefined) {
      clearTimeout(this.closeTimer)
      this.closeTimer = undefined
    }
    this.worker.unref()
    if (error === undefined) resolve()
    else reject(error)
  }

  private rejectPending(error: Error): void {
    this.failure = error
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.worker.unref()
  }
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
    ...(options.onLockRetryDiagnostic === undefined ? {} : { onDiagnostic: options.onLockRetryDiagnostic }),
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

function snapshotTrace(trace: Trace): Trace {
  return {
    id: trace.id,
    goal: redactSensitiveText(trace.goal),
    status: trace.status,
    startedAt: trace.startedAt,
    ...(trace.endedAt === undefined ? {} : { endedAt: trace.endedAt }),
    spans: trace.spans.map(span => ({
      id: span.id,
      traceId: span.traceId,
      ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
      name: span.name,
      status: span.status,
      startedAt: span.startedAt,
      ...(span.endedAt === undefined ? {} : { endedAt: span.endedAt }),
      ...(span.durationMs === undefined ? {} : { durationMs: span.durationMs }),
      ...(span.errorMessage === undefined ? {} : { errorMessage: redactSensitiveText(span.errorMessage) }),
      metadata: redactMetadata(JSON.parse(JSON.stringify(span.metadata)) as Record<string, unknown>) as Record<string, unknown>,
      thoughtBlocks: span.thoughtBlocks.map(redactSensitiveText),
    })),
  }
}

const REDACTED = '<redacted>'
const REDACTION_MARKERS = new Set(['[REDACTED]', '<redacted>', '***'])
const SENSITIVE_METADATA_KEY_RE = /(?:^|[_-])(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIAL|COOKIE|BEARER|AUTH|AUTHORIZATION|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLAUDE[_-]?SESSION)(?:$|[_-])/iu
const SENSITIVE_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  /\b(?:sk|gho|ghp|glpat|xox[baprs])-?[A-Za-z0-9_\-]{12,}\b/gu,
  /\bnpm_[A-Za-z0-9_\-]{12,}\b/gu,
  /https:\/\/(?:discord(?:app)?\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/giu,
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]*:[^\s@/]+@[^\s]+/giu,
  /\b(?:Bearer|token)\s+[A-Za-z0-9._~+/=-]{20,}\b/giu,
  /\b(?:Cookie|Set-Cookie):\s*[^\r\n]+/giu,
  /\b(?:Proxy-)?Authorization:\s*[^\r\n]+/giu,
]
const SENSITIVE_ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gu
const SENSITIVE_JSON_FIELD_RE = /("([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gu

function redactSensitiveText(text: string): string {
  let redacted = text.replace(SENSITIVE_ASSIGNMENT_RE, (match, key: string) => {
    return isSensitiveMetadataKey(key) ? `${key}=${REDACTED}` : match
  })
  redacted = redacted.replace(SENSITIVE_JSON_FIELD_RE, (match, prefix: string, key: string) => {
    return isSensitiveMetadataKey(key) ? `${prefix}"${REDACTED}"` : match
  })
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED)
  }
  return redacted
}

function normalizeSensitiveKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/giu, '_')
}

function isSensitiveMetadataKey(key: string): boolean {
  return SENSITIVE_METADATA_KEY_RE.test(normalizeSensitiveKey(key))
}

function redactMetadata(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveText(value)
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactMetadata)
  const redacted: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = redactMetadataEntry(key, nestedValue)
  }
  return redacted
}

function redactMetadataEntry(key: string, value: unknown): unknown {
  if (!isSensitiveMetadataKey(key)) return redactMetadata(value)
  if (typeof value === 'string' && REDACTION_MARKERS.has(value)) return value
  return REDACTED
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
    ...(row.parentSpanId === null ? {} : { parentSpanId: row.parentSpanId }),
    name: row.name,
    status: row.status as Span['status'],
    startedAt: row.startedAt,
    ...(row.endedAt === null ? {} : { endedAt: row.endedAt }),
    ...(row.durationMs === null ? {} : { durationMs: row.durationMs }),
    ...(row.errorMessage === null ? {} : { errorMessage: row.errorMessage }),
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
  private readonly workerClient: SQLiteWorkerClient | undefined
  private readonly maxFlushedSpanSnapshots: number
  private readonly lockRetry: NormalizedLockRetryOptions
  private readonly filePath: string
  private readonly flushedSpans = new Map<string, Map<string, FlushedSpanState>>()
  private flushedSpanSnapshotCount = 0
  private operationTail: Promise<unknown> | undefined
  private closeAfterOperations = false
  private closed = false
  private closePromise: Promise<void> | undefined

  constructor(filePath: string, options: SQLiteAdapterOptions = {}) {
    const lockRetry = normalizeLockRetryOptions(options)
    const databasePath = filePath === ':memory:' || filePath === '' ? filePath : resolve(filePath)
    mkdirSync(dirname(databasePath), { recursive: true })
    this.db = new Database(databasePath)
    this.filePath = databasePath
    this.lockRetry = lockRetry
    this.maxFlushedSpanSnapshots = Math.max(
      0,
      Math.floor(options.maxFlushedSpanSnapshots ?? 10_000),
    )
    try {
      this.db.pragma(`busy_timeout = ${this.lockRetry.busyTimeoutMs}`)
      this.withSqliteLockRetrySync('initialize SQLite adapter', () => {
        this.db.pragma('journal_mode = WAL')
        this.db.pragma('foreign_keys = ON')
        const traceIndexes = this.db.pragma("index_list('traces')") as Array<{ name?: unknown }>
        const schemaInitialized = Array.isArray(traceIndexes)
          && traceIndexes.some(index => index.name === SQLITE_SCHEMA_SENTINEL_INDEX)
        if (!schemaInitialized) {
          this.db.exec(CREATE_TABLES)
        }
      })
      const isTransientDatabase = databasePath === ':memory:' || databasePath === ''
      this.workerClient = options.useWorkerThread === false || isTransientDatabase
        ? undefined
        : new SQLiteWorkerClient(databasePath, this.lockRetry.busyTimeoutMs)
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  async flush(trace: Trace): Promise<void> {
    const snapshot = snapshotTrace(trace)
    return this.enqueueSqliteOperation(() => this.flushNow([snapshot]))
  }

  async flushBatch(traces: Trace[]): Promise<void> {
    if (traces.length === 0) return
    const snapshots = traces.map(snapshotTrace)
    return this.enqueueSqliteOperation(() => this.flushNow(snapshots))
  }

  private async flushNow(traces: Trace[]): Promise<void> {
    for (const trace of traces) warnIfTraceHasActiveSpans(trace, 'SQLiteAdapter')
    const operation = traces.length === 1 ? 'flush trace transaction' : 'flush trace batch transaction'
    if (this.workerClient !== undefined) {
      const batchFlushedSpans = new Map<string, FlushedSpanState>()
      const flushedSpans: Span[] = []
      const workerTraces = traces.map(trace => ({
        id: trace.id,
        goal: trace.goal,
        status: trace.status,
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        spans: trace.spans.flatMap(span => {
          const batchKey = `${span.traceId}\0${span.id}`
          const previous = batchFlushedSpans.get(batchKey)
            ?? this.flushedSpans.get(span.traceId)?.get(span.id)
          if (!this.shouldFlushSpan(span, previous)) return []
          batchFlushedSpans.set(batchKey, this.toFlushedSpanState(span))
          flushedSpans.push(span)
          return [{
            id: span.id,
            traceId: span.traceId,
            parentSpanId: span.parentSpanId,
            name: span.name,
            status: span.status,
            startedAt: span.startedAt,
            endedAt: span.endedAt,
            durationMs: span.durationMs,
            errorMessage: span.errorMessage,
            metadataJson: JSON.stringify(span.metadata),
            thoughtBlocksJson: JSON.stringify(span.thoughtBlocks),
          }]
        }),
      }))
      await this.withSqliteLockRetry(operation, () => this.workerClient!.request<void>('flush', {
        traces: workerTraces,
      }))
      for (const span of flushedSpans) this.rememberFlushedSpan(span)
      return
    }

    const flushedInTransaction = await this.withSqliteLockRetry(operation, () => {
      const upsertTrace = this.db.prepare(UPSERT_TRACE)
      const upsertSpan = this.db.prepare(UPSERT_SPAN)
      const flushed: Span[] = []

      const transaction = this.db.transaction((batch: Trace[]) => {
        const batchFlushedSpans = new Map<string, FlushedSpanState>()
        for (const trace of batch) {
          upsertTrace.run({
            id: trace.id,
            goal: trace.goal,
            status: trace.status,
            startedAt: trace.startedAt,
            endedAt: trace.endedAt ?? null,
          })
          for (const span of trace.spans) {
            const batchKey = `${span.traceId}\0${span.id}`
            const previous = batchFlushedSpans.get(batchKey)
              ?? this.flushedSpans.get(span.traceId)?.get(span.id)
            if (!this.shouldFlushSpan(span, previous)) continue

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
            flushed.push(span)
            batchFlushedSpans.set(batchKey, this.toFlushedSpanState(span))
          }
        }
      })

      transaction(traces)
      return flushed
    })
    for (const span of flushedInTransaction) {
      this.rememberFlushedSpan(span)
    }
  }

  private shouldFlushSpan(
    span: Span,
    previous = this.flushedSpans.get(span.traceId)?.get(span.id),
  ): boolean {
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

  private toFlushedSpanState(span: Span): FlushedSpanState {
    return {
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
    }
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
    byTrace.set(span.id, this.toFlushedSpanState(span))
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
    return this.enqueueSqliteOperation(async () => {
      if (this.workerClient !== undefined) {
        const result = await this.withSqliteLockRetry('query trace by id', () => (
          this.workerClient!.request<SQLiteWorkerQueryResult>('queryByTraceId', { traceId })
        ))
        const traceRow = result.traceRow
        if (traceRow === undefined) return null
        return {
          id: traceRow.id,
          goal: traceRow.goal,
          status: traceRow.status as Trace['status'],
          startedAt: traceRow.startedAt,
          ...(traceRow.endedAt === null ? {} : { endedAt: traceRow.endedAt }),
          spans: result.spanRows.map(rowToSpan),
        }
      }

      return this.withSqliteLockRetry('query trace by id', () => {
        const traceRow = this.db.prepare(SELECT_TRACE).get(traceId) as TraceRow | undefined
        if (traceRow === undefined) return null
        const spanRows = this.db.prepare(SELECT_SPANS).all(traceId) as SpanRow[]
        return {
          id: traceRow.id,
          goal: traceRow.goal,
          status: traceRow.status as Trace['status'],
          startedAt: traceRow.startedAt,
          ...(traceRow.endedAt === null ? {} : { endedAt: traceRow.endedAt }),
          spans: spanRows.map(rowToSpan),
        }
      })
    })
  }

  async listTraceIds(): Promise<string[]> {
    return this.enqueueSqliteOperation(async () => {
      if (this.workerClient !== undefined) {
        return this.withSqliteLockRetry('list trace ids', () => (
          this.workerClient!.request<string[]>('listTraceIds')
        ))
      }
      return this.withSqliteLockRetry('list trace ids', () => {
        const rows = this.db.prepare(SELECT_ALL_TRACE_IDS).all() as { id: string }[]
        return rows.map(r => r.id)
      })
    })
  }

  async listTraceSummaries(): Promise<TraceSummary[]> {
    return this.enqueueSqliteOperation(async () => {
      const rows = this.workerClient !== undefined
        ? await this.withSqliteLockRetry('list trace summaries', () => (
            this.workerClient!.request<TraceSummaryRow[]>('listTraceSummaries')
          ))
        : await this.withSqliteLockRetry('list trace summaries', () => (
            this.db.prepare(SELECT_TRACE_SUMMARIES).all() as TraceSummaryRow[]
          ))
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
    return this.enqueueSqliteOperation(() => this.deleteTraceNow(traceId))
  }

  private async deleteTraceNow(traceId: string): Promise<void> {
    if (this.workerClient !== undefined) {
      await this.withSqliteLockRetry('delete trace transaction', () => (
        this.workerClient!.request<void>('deleteTrace', { traceId })
      ))
    } else {
      await this.withSqliteLockRetry('delete trace transaction', () => {
        const deleteSpans = this.db.prepare(DELETE_SPANS_BY_TRACE)
        const deleteTrace = this.db.prepare(DELETE_TRACE)
        const transaction = this.db.transaction((id: string) => {
          deleteSpans.run(id)
          deleteTrace.run(id)
        })

        transaction(traceId)
      })
    }
    const flushed = this.flushedSpans.get(traceId)
    if (flushed !== undefined) {
      this.flushedSpanSnapshotCount -= flushed.size
      this.flushedSpans.delete(traceId)
    }
  }

  private enqueueSqliteOperation<T>(action: () => Promise<T>): Promise<T> {
    if (this.closed || this.closeAfterOperations) {
      return Promise.reject(new Error('SQLiteAdapter is closed'))
    }

    const queued = this.operationTail === undefined ? action() : this.operationTail.then(action)
    const settled = queued.catch(() => undefined).finally(() => {
      if (this.operationTail !== settled) return
      this.operationTail = undefined
    })
    this.operationTail = settled
    return queued
  }

  private closeNow(): Promise<void> {
    if (this.closed) return Promise.resolve()
    this.closed = true
    if (this.workerClient === undefined) {
      this.db.close()
      return Promise.resolve()
    }
    return this.workerClient.close().finally(() => this.db.close())
  }

  private emitLockRetryDiagnostic(diagnostic: SQLiteLockRetryDiagnostic): void {
    try {
      this.lockRetry.onDiagnostic?.(diagnostic)
    } catch {
      // Diagnostics are best-effort. A logging/metrics hook must not change
      // storage retry or exhaustion behavior.
    }
  }

  private async withSqliteLockRetry<T>(operationClass: string, action: () => T | Promise<T>): Promise<T> {
    const startedAt = Date.now()
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await action()
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
        this.emitLockRetryDiagnostic(diagnostic)

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

  private withSqliteLockRetrySync<T>(operationClass: string, action: () => T): T {
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
        this.emitLockRetryDiagnostic(diagnostic)

        if (exhausted) {
          throw new SQLiteLockRetryExhaustedError(
            `[SQLiteAdapter] SQLite lock persisted for ${operationClass} on ${this.filePath} after ${attempt + 1} attempts over ${elapsedMs}ms. Next action: ${diagnostic.nextAction}`,
            diagnostic,
            error,
          )
        }

        sleepSync(nextDelayMs ?? 0)
      }
    }
  }

  private nextLockRetryDelay(attempt: number): number {
    const base = Math.min(this.lockRetry.baseDelayMs * 2 ** attempt, this.lockRetry.maxDelayMs)
    if (!this.lockRetry.jitter) return base
    return Math.min(base + Math.random() * this.lockRetry.baseDelayMs, this.lockRetry.maxDelayMs)
  }

  /** Release both DB connections. Await completion before reopening the database or exiting. */
  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise
    this.closeAfterOperations = true
    this.closePromise = this.operationTail === undefined
      ? this.closeNow()
      : this.operationTail.then(() => this.closeNow())
    return this.closePromise
  }
}

function sleepSync(ms: number): void {
  if (ms <= 0) return
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, ms)
}
