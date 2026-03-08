import type { ExportAdapter } from '../export/ExportAdapter.js';
export interface TraceServerOptions {
    adapter: ExportAdapter;
    /** Port to listen on. Use 0 to let the OS assign a free port. Default: 4040 */
    port?: number;
}
/**
 * Lightweight local HTTP server for inspecting traces in a browser.
 * Zero external dependencies — uses Node's built-in `node:http`.
 *
 * Routes:
 *   GET /              → self-contained HTML trace viewer
 *   GET /api/traces    → { traces: TraceSummary[] }
 *   GET /api/traces/:id → Trace (full) or 404 JSON
 *
 * Usage:
 * ```ts
 * const server = new TraceServer({ adapter, port: 4040 })
 * await server.start()
 * console.log(`Trace viewer at ${server.url}`)
 * ```
 */
export declare class TraceServer {
    private readonly adapter;
    private readonly requestedPort;
    private _port;
    private server;
    constructor(options: TraceServerOptions);
    /** Start listening. Resolves once the server is ready to accept connections. */
    start(): Promise<void>;
    /** Stop accepting connections and close the server. */
    stop(): Promise<void>;
    /** Full base URL of the server, e.g. `http://localhost:4040`. */
    get url(): string;
    private handleRequest;
}
//# sourceMappingURL=TraceServer.d.ts.map