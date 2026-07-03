import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChunkSessionGc } from '../../../src/session/chunk-session-gc.js';
import { FileChunkSessionStore } from '../../../src/session/chunk-session-store.js';
import { FileChunkSessionSnapshotStore } from '../../../src/session/chunk-session-snapshot-store.js';
import { createChunkSession, chunkSessionStorageKey } from '../../../src/session/chunk-session.js';

describe('ChunkSessionGc', () => {
  it('deletes expired completed sessions and orphaned snapshots but retains recent active ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-gc-'));
    const sessionRoot = join(root, 'chunk-sessions');
    const snapshotRoot = join(root, 'chunk-session-snapshots');
    const store = new FileChunkSessionStore(sessionRoot);
    const now = new Date('2026-03-09T12:00:00.000Z');

    store.save({
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:old_done',
        chunkId: 'old_done',
        promiseTag: 'IMPL_old_done_DONE',
        workingDir: root,
        provider: 'claude',
        maxTokens: 200000,
      }),
      status: 'completed',
      updatedAt: '2026-03-07T00:00:00.000Z',
    });
    store.save({
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:active',
        chunkId: 'active',
        promiseTag: 'IMPL_active_DONE',
        workingDir: root,
        provider: 'claude',
        maxTokens: 200000,
      }),
      status: 'active',
      updatedAt: '2026-03-09T11:30:00.000Z',
    });

    const orphanDir = join(snapshotRoot, 'demo-plan', 'orphan');
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(join(orphanDir, 'snapshot.json'), '{}');

    const gc = new ChunkSessionGc({
      sessionRoot,
      snapshotRoot,
      completedTtlMs: 24 * 60 * 60 * 1000,
      failedTtlMs: 72 * 60 * 60 * 1000,
    });

    const removed = gc.collect(now);

    expect(removed).toBeGreaterThanOrEqual(2);
    expect(store.load('demo-plan', 'old_done')).toBeUndefined();
    expect(store.load('demo-plan', 'active')).toBeDefined();
    expect(existsSync(orphanDir)).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves snapshots for a session whose primary file is corrupt (quarantined, not deleted)', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-gc-quarantine-'));
    const sessionRoot = join(root, 'chunk-sessions');
    const snapshotRoot = join(root, 'chunk-session-snapshots');
    const now = new Date('2026-03-09T12:00:00.000Z');

    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:torn',
      chunkId: 'torn',
      promiseTag: 'IMPL_torn_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    // A snapshot exists for this session and should survive GC even though
    // the primary session file below is corrupt (crash mid-write) and gets
    // quarantined rather than parsed — it must not be treated as "gone".
    const snapshots = new FileChunkSessionSnapshotStore(snapshotRoot);
    snapshots.writeSnapshot(session, 'pre-compaction');

    const sessionPlanDir = join(sessionRoot, 'demo-plan');
    mkdirSync(sessionPlanDir, { recursive: true });
    const sessionKey = chunkSessionStorageKey(session.chunkId, session.taskId);
    writeFileSync(join(sessionPlanDir, `${sessionKey}.json`), '{"chunkId": "torn", "trunc');

    const gc = new ChunkSessionGc({
      sessionRoot,
      snapshotRoot,
      completedTtlMs: 24 * 60 * 60 * 1000,
      failedTtlMs: 72 * 60 * 60 * 1000,
    });

    gc.collect(now);

    const snapshotDir = join(snapshotRoot, 'demo-plan', sessionKey);
    expect(existsSync(snapshotDir)).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves task-scoped snapshots for legacy sessions stored as <chunkId>.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-gc-legacy-'));
    const sessionRoot = join(root, 'chunk-sessions');
    const snapshotRoot = join(root, 'chunk-session-snapshots');
    const now = new Date('2026-03-09T12:00:00.000Z');
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:legacy',
      chunkId: 'legacy',
      promiseTag: 'IMPL_legacy_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    const snapshots = new FileChunkSessionSnapshotStore(snapshotRoot);
    snapshots.writeSnapshot(session, 'pre-compaction');

    const sessionPlanDir = join(sessionRoot, 'demo-plan');
    mkdirSync(sessionPlanDir, { recursive: true });
    writeFileSync(join(sessionPlanDir, `${session.chunkId}.json`), JSON.stringify(session));

    const gc = new ChunkSessionGc({
      sessionRoot,
      snapshotRoot,
      completedTtlMs: 24 * 60 * 60 * 1000,
      failedTtlMs: 72 * 60 * 60 * 1000,
    });

    gc.collect(now);

    const snapshotDir = join(snapshotRoot, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    expect(existsSync(snapshotDir)).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('preserves task-scoped snapshots when only a corrupt legacy session file remains', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-gc-corrupt-legacy-'));
    const sessionRoot = join(root, 'chunk-sessions');
    const snapshotRoot = join(root, 'chunk-session-snapshots');
    const now = new Date('2026-03-09T12:00:00.000Z');
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:legacy',
      chunkId: 'legacy',
      promiseTag: 'IMPL_legacy_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });

    const snapshots = new FileChunkSessionSnapshotStore(snapshotRoot);
    snapshots.writeSnapshot(session, 'pre-compaction');

    const sessionPlanDir = join(sessionRoot, 'demo-plan');
    mkdirSync(sessionPlanDir, { recursive: true });
    writeFileSync(join(sessionPlanDir, `${session.chunkId}.json.corrupt.1.1`), '{"chunkId": "legacy", "trunc');

    const gc = new ChunkSessionGc({
      sessionRoot,
      snapshotRoot,
      completedTtlMs: 24 * 60 * 60 * 1000,
      failedTtlMs: 72 * 60 * 60 * 1000,
    });

    gc.collect(now);

    const snapshotDir = join(snapshotRoot, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    expect(existsSync(snapshotDir)).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('drops stale quarantines when expiring a session so its snapshots can be collected', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-gc-expire-quarantine-'));
    const sessionRoot = join(root, 'chunk-sessions');
    const snapshotRoot = join(root, 'chunk-session-snapshots');
    const store = new FileChunkSessionStore(sessionRoot);
    const now = new Date('2026-03-09T12:00:00.000Z');
    const session = {
      ...createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:old_done',
        chunkId: 'old_done',
        promiseTag: 'IMPL_old_done_DONE',
        workingDir: root,
        provider: 'claude',
        maxTokens: 200000,
      }),
      status: 'completed' as const,
      updatedAt: '2026-03-07T00:00:00.000Z',
    };
    store.save(session);

    const snapshots = new FileChunkSessionSnapshotStore(snapshotRoot);
    snapshots.writeSnapshot(session, 'pre-compaction');

    const sessionKey = chunkSessionStorageKey(session.chunkId, session.taskId);
    const sessionPlanDir = join(sessionRoot, 'demo-plan');
    writeFileSync(join(sessionPlanDir, `${sessionKey}.json.corrupt.1.1`), '{"chunkId": "old_done", "trunc');

    const gc = new ChunkSessionGc({
      sessionRoot,
      snapshotRoot,
      completedTtlMs: 24 * 60 * 60 * 1000,
      failedTtlMs: 72 * 60 * 60 * 1000,
    });

    gc.collect(now);

    expect(store.listStorageKeys()).toEqual([]);
    expect(existsSync(join(snapshotRoot, 'demo-plan', sessionKey))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
