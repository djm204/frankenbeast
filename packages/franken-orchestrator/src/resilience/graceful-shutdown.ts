import type { BeastContext } from '../context/franken-context.js';
import { saveContext } from './context-serializer.js';

export type ShutdownHandler = () => Promise<void> | void;

/**
 * Manages graceful shutdown for the Beast Loop process.
 * On SIGTERM/SIGINT: saves context to disk, runs cleanup handlers, exits.
 */
export class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private context?: BeastContext;
  private snapshotPath?: string;
  private shuttingDown = false;
  private readonly boundHandler: () => void;

  constructor() {
    this.boundHandler = () => { void this.shutdown(); };
  }

  /** Register signal handlers. */
  install(): void {
    process.on('SIGTERM', this.boundHandler);
    process.on('SIGINT', this.boundHandler);
  }

  /** Remove signal handlers. */
  uninstall(): void {
    process.removeListener('SIGTERM', this.boundHandler);
    process.removeListener('SIGINT', this.boundHandler);
  }

  /** Set the active context for snapshot on shutdown. */
  setContext(ctx: BeastContext, snapshotPath: string): void {
    this.context = ctx;
    this.snapshotPath = snapshotPath;
  }

  /** Register a cleanup handler to run on shutdown. */
  onShutdown(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  /** Execute shutdown sequence. */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    // Save context snapshot if available
    if (this.context && this.snapshotPath) {
      try {
        await saveContext(this.context, this.snapshotPath);
      } catch {
        // Best effort — process is shutting down
      }
    }

    // Run cleanup handlers
    for (const handler of this.handlers) {
      try {
        await handler();
      } catch {
        // Best effort
      }
    }

    this.uninstall();
  }

  /** Check if shutdown is in progress. */
  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
