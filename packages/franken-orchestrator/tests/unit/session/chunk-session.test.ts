import { describe, it, expect } from 'vitest';
import { createChunkSession, createChunkTranscriptEntry } from '../../../src/session/chunk-session.js';
import { getProjectPaths } from '../../../src/cli/project-root.js';

describe('chunk-session', () => {
  it('creates a new active session with 85% compact threshold', () => {
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: '/tmp/demo',
      provider: 'claude',
      maxTokens: 200000,
    });

    expect(session.status).toBe('active');
    expect(session.contextWindow.compactThreshold).toBe(0.85);
    expect(session.transcript).toEqual([]);
  });

  it('adds build paths for chunk sessions and snapshots', () => {
    const paths = getProjectPaths('/tmp/project', 'demo-plan');
    expect(paths.chunkSessionsDir.endsWith('.fbeast/.build/chunk-sessions')).toBe(true);
    expect(paths.chunkSessionSnapshotsDir.endsWith('.fbeast/.build/chunk-session-snapshots')).toBe(true);
  });

  it('creates normalized transcript entries with timestamps', () => {
    const entry = createChunkTranscriptEntry('objective', 'implement the feature');
    expect(entry.kind).toBe('objective');
    expect(entry.content).toContain('implement');
    expect(entry.createdAt).toMatch(/T/);
  });
});
