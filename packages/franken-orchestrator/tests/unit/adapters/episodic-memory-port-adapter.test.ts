import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodicMemoryPortAdapter } from '../../../src/adapters/episodic-memory-port-adapter.js';
import type { EpisodicStorePort } from '../../../src/adapters/episodic-memory-port-adapter.js';

type TraceRecord = Parameters<EpisodicStorePort['record']>[0];
type TraceResult = ReturnType<EpisodicStorePort['queryFailed']>[number];

function createFakeStore() {
  const traces: TraceRecord[] = [];
  return {
    record: vi.fn((trace: TraceRecord) => {
      traces.push(trace);
      return trace.id;
    }),
    queryFailed: vi.fn((_projectId: string): TraceResult[] =>
      traces.filter(t => t.status === 'failure') as TraceResult[],
    ),
    _traces: traces,
  };
}

describe('EpisodicMemoryPortAdapter', () => {
  let store: ReturnType<typeof createFakeStore>;
  let adapter: EpisodicMemoryPortAdapter;

  beforeEach(() => {
    store = createFakeStore();
    adapter = new EpisodicMemoryPortAdapter({
      episodicStore: store,
      projectId: 'test-project',
      projectRoot: '/tmp/nonexistent-project',
    });
  });

  describe('recordTrace', () => {
    it('converts EpisodicEntry to EpisodicTrace and calls store.record', async () => {
      await adapter.recordTrace({
        taskId: 'task-1',
        summary: 'Built the widget',
        outcome: 'success',
        timestamp: '2026-03-12T10:00:00.000Z',
      });

      expect(store.record).toHaveBeenCalledOnce();
      const recorded = store.record.mock.calls[0][0];
      expect(recorded.type).toBe('episodic');
      expect(recorded.projectId).toBe('test-project');
      expect(recorded.taskId).toBe('task-1');
      expect(recorded.status).toBe('success');
      expect(recorded.createdAt).toBe(Date.parse('2026-03-12T10:00:00.000Z'));
      expect(recorded.input).toBe('Built the widget');
      expect(recorded.output).toBeNull();
      expect(recorded.id).toBeTruthy();
    });

    it('maps failure outcome to failure status', async () => {
      await adapter.recordTrace({
        taskId: 'task-2',
        summary: 'Crashed',
        outcome: 'failure',
        timestamp: '2026-03-12T11:00:00.000Z',
      });

      const recorded = store.record.mock.calls[0][0];
      expect(recorded.status).toBe('failure');
    });

    it('falls back to Date.now() for invalid timestamps', async () => {
      const before = Date.now();
      await adapter.recordTrace({
        taskId: 'task-3',
        summary: 'Bad time',
        outcome: 'success',
        timestamp: 'not-a-date',
      });

      const recorded = store.record.mock.calls[0][0];
      expect(recorded.createdAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getContext', () => {
    it('returns failed traces as knownErrors', async () => {
      store.queryFailed.mockReturnValue([
        {
          id: 'trace-1',
          type: 'episodic' as const,
          projectId: 'test-project',
          taskId: 'task-1',
          status: 'failure',
          createdAt: Date.now(),
          input: 'Widget build failed',
          output: null,
        },
      ]);

      const ctx = await adapter.getContext('test-project');

      expect(store.queryFailed).toHaveBeenCalledWith('test-project');
      expect(ctx.knownErrors).toEqual(['Widget build failed']);
      expect(ctx.rules).toEqual([]);
    });

    it('stringifies non-string input in knownErrors', async () => {
      store.queryFailed.mockReturnValue([
        {
          id: 'trace-2',
          type: 'episodic' as const,
          projectId: 'test-project',
          taskId: 'task-2',
          status: 'failure',
          createdAt: Date.now(),
          input: { error: 'timeout' },
          output: null,
        },
      ]);

      const ctx = await adapter.getContext('test-project');

      expect(ctx.knownErrors).toEqual(['{"error":"timeout"}']);
    });
  });

  describe('frontload', () => {
    it('returns empty adrs when docs/adr does not exist', async () => {
      await adapter.frontload('test-project');
      const ctx = await adapter.getContext('test-project');

      expect(ctx.adrs).toEqual([]);
    });
  });
});
