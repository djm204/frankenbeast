import { describe, it, expect } from 'vitest';
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
});
