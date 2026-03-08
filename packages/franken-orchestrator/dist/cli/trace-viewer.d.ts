import type { BeastLogger } from '../logging/beast-logger.js';
export interface TraceViewerHandle {
    stop(): Promise<void>;
}
/**
 * Dynamically imports SQLiteAdapter and TraceServer from @frankenbeast/observer
 * and starts a trace viewer HTTP server on port 4040.
 *
 * Returns a handle for cleanup, or null if setup fails
 * (e.g., better-sqlite3 native module not installed).
 */
export declare function setupTraceViewer(tracesDbPath: string, logger: BeastLogger): Promise<TraceViewerHandle | null>;
//# sourceMappingURL=trace-viewer.d.ts.map