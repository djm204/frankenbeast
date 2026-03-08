import type { BeastContext } from '../context/franken-context.js';
export type ShutdownHandler = () => Promise<void> | void;
/**
 * Manages graceful shutdown for the Beast Loop process.
 * On SIGTERM/SIGINT: saves context to disk, runs cleanup handlers, exits.
 */
export declare class GracefulShutdown {
    private handlers;
    private context?;
    private snapshotPath?;
    private shuttingDown;
    private readonly boundHandler;
    constructor();
    /** Register signal handlers. */
    install(): void;
    /** Remove signal handlers. */
    uninstall(): void;
    /** Set the active context for snapshot on shutdown. */
    setContext(ctx: BeastContext, snapshotPath: string): void;
    /** Register a cleanup handler to run on shutdown. */
    onShutdown(handler: ShutdownHandler): void;
    /** Execute shutdown sequence. */
    shutdown(): Promise<void>;
    /** Check if shutdown is in progress. */
    get isShuttingDown(): boolean;
}
//# sourceMappingURL=graceful-shutdown.d.ts.map