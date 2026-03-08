import { describe, it, expect, vi, afterEach } from 'vitest';
import { GracefulShutdown } from '../../../src/resilience/graceful-shutdown.js';

describe('GracefulShutdown', () => {
  afterEach(() => {
    // Clean up any lingering signal listeners
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('installs and uninstalls signal handlers', () => {
    const shutdown = new GracefulShutdown();
    const before = process.listenerCount('SIGTERM');

    shutdown.install();
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);

    shutdown.uninstall();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  it('runs cleanup handlers on shutdown', async () => {
    const shutdown = new GracefulShutdown();
    const handler = vi.fn();

    shutdown.onShutdown(handler);
    await shutdown.shutdown();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('runs multiple cleanup handlers in order', async () => {
    const shutdown = new GracefulShutdown();
    const order: number[] = [];

    shutdown.onShutdown(() => { order.push(1); });
    shutdown.onShutdown(() => { order.push(2); });
    shutdown.onShutdown(() => { order.push(3); });

    await shutdown.shutdown();

    expect(order).toEqual([1, 2, 3]);
  });

  it('only shuts down once (idempotent)', async () => {
    const shutdown = new GracefulShutdown();
    const handler = vi.fn();

    shutdown.onShutdown(handler);
    await shutdown.shutdown();
    await shutdown.shutdown();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('reports shutdown state', async () => {
    const shutdown = new GracefulShutdown();

    expect(shutdown.isShuttingDown).toBe(false);
    await shutdown.shutdown();
    expect(shutdown.isShuttingDown).toBe(true);
  });

  it('survives handler errors without crashing', async () => {
    const shutdown = new GracefulShutdown();
    const goodHandler = vi.fn();

    shutdown.onShutdown(() => { throw new Error('handler crash'); });
    shutdown.onShutdown(goodHandler);

    await shutdown.shutdown();

    // Good handler still ran despite first handler throwing
    expect(goodHandler).toHaveBeenCalledOnce();
  });
});
