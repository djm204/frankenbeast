import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
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
export async function setupTraceViewer(
  tracesDbPath: string,
  logger: BeastLogger,
): Promise<TraceViewerHandle | null> {
  try {
    const dir = dirname(tracesDbPath);
    if (!existsSync(dir)) {
      logger.warn(`Traces directory does not exist: ${dir}`, 'observer');
      return null;
    }

    const { SQLiteAdapter, TraceServer } = await import('@frankenbeast/observer');
    const sqliteAdapter = new SQLiteAdapter(tracesDbPath);
    const traceServer = new TraceServer({ adapter: sqliteAdapter, port: 4040 });

    await traceServer.start();
    logger.info(`Trace viewer: ${traceServer.url}`, 'observer');

    let stopped = false;
    return {
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await traceServer.stop();
        sqliteAdapter.close();
      },
    };
  } catch (err) {
    logger.warn(`Trace viewer unavailable: ${(err as Error).message}`, 'observer');
    return null;
  }
}
