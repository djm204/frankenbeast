import Database from 'better-sqlite3';
import { CREATE_TABLES, UPSERT_TRACE, UPSERT_SPAN, SELECT_TRACE, SELECT_SPANS, SELECT_ALL_TRACE_IDS, } from './schema.js';
function rowToSpan(row) {
    return {
        id: row.id,
        traceId: row.traceId,
        parentSpanId: row.parentSpanId ?? undefined,
        name: row.name,
        status: row.status,
        startedAt: row.startedAt,
        endedAt: row.endedAt ?? undefined,
        durationMs: row.durationMs ?? undefined,
        errorMessage: row.errorMessage ?? undefined,
        metadata: JSON.parse(row.metadata),
        thoughtBlocks: JSON.parse(row.thoughtBlocks),
    };
}
/**
 * Persistent SQLite-backed export adapter.
 * Uses WAL journal mode for safe concurrent reads and batched
 * transactions for multi-span flushes.
 */
export class SQLiteAdapter {
    db;
    constructor(filePath) {
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.exec(CREATE_TABLES);
    }
    async flush(trace) {
        const upsertTrace = this.db.prepare(UPSERT_TRACE);
        const upsertSpan = this.db.prepare(UPSERT_SPAN);
        const transaction = this.db.transaction((t) => {
            upsertTrace.run({
                id: t.id,
                goal: t.goal,
                status: t.status,
                startedAt: t.startedAt,
                endedAt: t.endedAt ?? null,
            });
            for (const span of t.spans) {
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
                });
            }
        });
        transaction(trace);
    }
    async queryByTraceId(traceId) {
        const traceRow = this.db.prepare(SELECT_TRACE).get(traceId);
        if (traceRow === undefined)
            return null;
        const spanRows = this.db.prepare(SELECT_SPANS).all(traceId);
        return {
            id: traceRow.id,
            goal: traceRow.goal,
            status: traceRow.status,
            startedAt: traceRow.startedAt,
            endedAt: traceRow.endedAt ?? undefined,
            spans: spanRows.map(rowToSpan),
        };
    }
    async listTraceIds() {
        const rows = this.db.prepare(SELECT_ALL_TRACE_IDS).all();
        return rows.map(r => r.id);
    }
    /** Release the DB connection. Call when shutting down. */
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SQLiteAdapter.js.map