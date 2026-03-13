import { afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileChunkSessionStore } from '../../../src/session/chunk-session-store.js';
import { FileChunkSessionSnapshotStore } from '../../../src/session/chunk-session-snapshot-store.js';
import { createChunkSession } from '../../../src/session/chunk-session.js';

describe('FileChunkSessionStore', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes and reloads a chunk session by plan/chunk id', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-session-'));
    tmpDirs.push(root);
    const store = new FileChunkSessionStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    store.save(session);
    const loaded = store.load('demo-plan', '01_demo');

    expect(loaded?.chunkId).toBe('01_demo');
  });

  it('stores impl and harden sessions separately for the same plan/chunk', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-session-stage-'));
    tmpDirs.push(root);
    const store = new FileChunkSessionStore(root);
    const implSession = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });
    const hardenSession = createChunkSession({
      planName: 'demo-plan',
      taskId: 'harden:01_demo',
      chunkId: '01_demo',
      promiseTag: 'HARDEN_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    store.save(implSession);
    store.save(hardenSession);

    const loadedImpl = store.load('demo-plan', '01_demo', 'impl:01_demo');
    const loadedHarden = store.load('demo-plan', '01_demo', 'harden:01_demo');

    expect(loadedImpl?.promiseTag).toBe('IMPL_01_demo_DONE');
    expect(loadedHarden?.promiseTag).toBe('HARDEN_01_demo_DONE');
  });

  it('writes immutable snapshots before compaction', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    const file = snapshots.writeSnapshot(session, 'pre-compaction');
    expect(file).toContain('01_demo');
    expect(snapshots.list('demo-plan', '01_demo')).toHaveLength(1);
  });
});
