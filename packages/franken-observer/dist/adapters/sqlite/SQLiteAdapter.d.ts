import type { Trace } from '../../core/types.js';
import type { ExportAdapter } from '../../export/ExportAdapter.js';
/**
 * Persistent SQLite-backed export adapter.
 * Uses WAL journal mode for safe concurrent reads and batched
 * transactions for multi-span flushes.
 */
export declare class SQLiteAdapter implements ExportAdapter {
    private readonly db;
    constructor(filePath: string);
    flush(trace: Trace): Promise<void>;
    queryByTraceId(traceId: string): Promise<Trace | null>;
    listTraceIds(): Promise<string[]>;
    /** Release the DB connection. Call when shutting down. */
    close(): void;
}
//# sourceMappingURL=SQLiteAdapter.d.ts.map