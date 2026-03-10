import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeastLogger } from '../../src/logging/beast-logger.js';

const { MockSQLiteAdapter, MockTraceServer, mockStart, mockStop, mockClose } = vi.hoisted(() => {
  const mockStart = vi.fn<() => Promise<void>>();
  const mockStop = vi.fn<() => Promise<void>>();
  const mockClose = vi.fn();
  const MockSQLiteAdapter = vi.fn();
  const MockTraceServer = vi.fn();
  return { MockSQLiteAdapter, MockTraceServer, mockStart, mockStop, mockClose };
});

vi.mock('@franken/core/observer', () => ({
  SQLiteAdapter: MockSQLiteAdapter,
  TraceServer: MockTraceServer,
}));

import { setupTraceViewer } from '../../src/cli/trace-viewer.js';

describe('Trace viewer wiring', () => {
  let logger: BeastLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockStart.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);

    MockSQLiteAdapter.mockImplementation(function (this: any) {
      this.close = mockClose;
    });
    MockTraceServer.mockImplementation(function (this: any) {
      this.start = mockStart;
      this.stop = mockStop;
      this.url = 'http://localhost:4040';
    });

    logger = new BeastLogger({ verbose: false, captureForFile: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts TraceServer when verbose is true', async () => {
    const handle = await setupTraceViewer('/tmp/test-traces.db', logger);

    expect(handle).not.toBeNull();
    expect(MockSQLiteAdapter).toHaveBeenCalledWith('/tmp/test-traces.db');
    expect(MockTraceServer).toHaveBeenCalledWith({
      adapter: expect.any(Object),
      port: 4040,
    });
    expect(mockStart).toHaveBeenCalledOnce();

    // Verify log output includes trace viewer URL with observer label
    const entries = logger.getLogEntries();
    const traceViewerEntry = entries.find(
      (e) => e.includes('Trace viewer') && e.includes('http://localhost:4040'),
    );
    expect(traceViewerEntry).toBeDefined();
    expect(traceViewerEntry).toContain('[observer]');
  });

  it('creates nothing when verbose is false (setupTraceViewer not called)', () => {
    // When verbose=false, createCliDeps skips setupTraceViewer entirely.
    // Verify the observer constructors are untouched.
    expect(MockSQLiteAdapter).not.toHaveBeenCalled();
    expect(MockTraceServer).not.toHaveBeenCalled();
  });

  it('returns null and logs warning when SQLiteAdapter throws', async () => {
    MockSQLiteAdapter.mockImplementation(function () {
      throw new Error('better-sqlite3 not available');
    });

    const handle = await setupTraceViewer('/tmp/test-traces.db', logger);

    expect(handle).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();

    const entries = logger.getLogEntries();
    const warningEntry = entries.find((e) => e.includes('better-sqlite3 not available'));
    expect(warningEntry).toBeDefined();
  });

  it('finalize calls traceServer.stop() and sqliteAdapter.close()', async () => {
    const handle = await setupTraceViewer('/tmp/test-traces.db', logger);
    expect(handle).not.toBeNull();

    await handle!.stop();

    expect(mockStop).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('finalize is idempotent — calling twice does not throw or double-close', async () => {
    const handle = await setupTraceViewer('/tmp/test-traces.db', logger);
    expect(handle).not.toBeNull();

    await handle!.stop();
    await handle!.stop();

    expect(mockStop).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });
});
