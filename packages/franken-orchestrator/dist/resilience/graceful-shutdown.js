import { saveContext } from './context-serializer.js';
/**
 * Manages graceful shutdown for the Beast Loop process.
 * On SIGTERM/SIGINT: saves context to disk, runs cleanup handlers, exits.
 */
export class GracefulShutdown {
    handlers = [];
    context;
    snapshotPath;
    shuttingDown = false;
    boundHandler;
    constructor() {
        this.boundHandler = () => { void this.shutdown(); };
    }
    /** Register signal handlers. */
    install() {
        process.on('SIGTERM', this.boundHandler);
        process.on('SIGINT', this.boundHandler);
    }
    /** Remove signal handlers. */
    uninstall() {
        process.removeListener('SIGTERM', this.boundHandler);
        process.removeListener('SIGINT', this.boundHandler);
    }
    /** Set the active context for snapshot on shutdown. */
    setContext(ctx, snapshotPath) {
        this.context = ctx;
        this.snapshotPath = snapshotPath;
    }
    /** Register a cleanup handler to run on shutdown. */
    onShutdown(handler) {
        this.handlers.push(handler);
    }
    /** Execute shutdown sequence. */
    async shutdown() {
        if (this.shuttingDown)
            return;
        this.shuttingDown = true;
        // Save context snapshot if available
        if (this.context && this.snapshotPath) {
            try {
                await saveContext(this.context, this.snapshotPath);
            }
            catch {
                // Best effort — process is shutting down
            }
        }
        // Run cleanup handlers
        for (const handler of this.handlers) {
            try {
                await handler();
            }
            catch {
                // Best effort
            }
        }
        this.uninstall();
    }
    /** Check if shutdown is in progress. */
    get isShuttingDown() {
        return this.shuttingDown;
    }
}
//# sourceMappingURL=graceful-shutdown.js.map