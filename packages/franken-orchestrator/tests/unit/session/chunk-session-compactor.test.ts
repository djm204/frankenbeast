import { describe, it, expect, vi } from 'vitest';
import { ChunkSessionCompactor } from '../../../src/session/chunk-session-compactor.js';
import { createChunkSession } from '../../../src/session/chunk-session.js';

describe('ChunkSessionCompactor', () => {
  it('replaces old transcript entries with a compaction summary and increments generation', async () => {
    const compactor = new ChunkSessionCompactor({
      summarize: async () => 'Summary: files touched and remaining objective.',
    });

    const session = {
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:01_demo',
        chunkId: '01_demo',
        promiseTag: 'IMPL_01_demo_DONE',
        workingDir: '/tmp/demo',
        provider: 'claude',
        maxTokens: 200000,
      }),
      transcript: [
        { kind: 'objective', content: 'build it', createdAt: new Date().toISOString() },
        { kind: 'assistant', content: 'working', createdAt: new Date().toISOString() },
      ],
    };

    const compacted = await compactor.compact(session);

    expect(compacted.compactionGeneration).toBe(1);
    expect(compacted.transcript.some((entry) => entry.kind === 'compaction_summary')).toBe(true);
  });

  it('records matching before and after token measurements after compaction is committed', async () => {
    const onCompaction = vi.fn(async () => undefined);
    const measureSessionTokens = vi.fn((session: ReturnType<typeof createChunkSession>) => (
      session.compactionGeneration === 0 ? 950 : 125
    ));
    const compactor = new ChunkSessionCompactor({
      summarize: async () => 'Compacted summary',
      measureSessionTokens,
      onCompaction,
    });
    const session = createChunkSession({
      planName: 'telemetry-plan',
      taskId: 'impl:telemetry',
      chunkId: 'telemetry',
      promiseTag: 'IMPL_TELEMETRY_DONE',
      workingDir: '/tmp/telemetry',
      provider: 'claude',
      maxTokens: 200000,
    });

    const compacted = await compactor.compact(session);
    await compactor.recordCompaction(session, compacted, 'threshold');

    expect(measureSessionTokens).toHaveBeenNthCalledWith(1, session);
    expect(measureSessionTokens).toHaveBeenNthCalledWith(2, compacted);
    expect(onCompaction).toHaveBeenCalledWith(expect.objectContaining({
      tokensBefore: 950,
      tokensAfter: 125,
      triggerReason: 'threshold',
    }));
  });

  it('timestamps observations with the wall clock used by rate windows', async () => {
    const onCompaction = vi.fn(async () => undefined);
    const compactor = new ChunkSessionCompactor({
      summarize: async () => 'Compacted summary',
      onCompaction,
    });
    const session = createChunkSession({
      planName: 'clock-plan',
      taskId: 'impl:clock',
      chunkId: 'clock',
      promiseTag: 'IMPL_CLOCK_DONE',
      workingDir: '/tmp/clock',
      provider: 'claude',
      maxTokens: 200000,
    });
    const compacted = {
      ...await compactor.compact(session),
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));

    try {
      await compactor.recordCompaction(session, compacted, 'threshold');
    } finally {
      vi.useRealTimers();
    }

    expect(onCompaction).toHaveBeenCalledWith(expect.objectContaining({
      timestamp: Date.parse('2030-01-01T00:00:00.000Z'),
    }));
  });

  it('commits manual compaction before recording its trigger reason', async () => {
    const order: string[] = [];
    const onCompaction = vi.fn(async () => { order.push('observe'); });
    const compactor = new ChunkSessionCompactor({
      summarize: async () => 'Compacted summary',
      onCompaction,
    });
    const session = createChunkSession({
      planName: 'manual-plan',
      taskId: 'impl:manual',
      chunkId: 'manual',
      promiseTag: 'IMPL_MANUAL_DONE',
      workingDir: '/tmp/manual',
      provider: 'claude',
      maxTokens: 200000,
    });

    const compacted = await compactor.compactAndRecord(session, async () => {
      order.push('persist');
    });

    expect(compacted.compactionGeneration).toBe(1);
    expect(order).toEqual(['persist', 'observe']);
    expect(onCompaction).toHaveBeenCalledWith(expect.objectContaining({
      triggerReason: 'manual',
    }));
  });
});
