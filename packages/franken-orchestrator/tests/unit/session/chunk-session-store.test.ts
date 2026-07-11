import { afterEach, describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileChunkSessionStore } from '../../../src/session/chunk-session-store.js';
import { FileChunkSessionSnapshotStore } from '../../../src/session/chunk-session-snapshot-store.js';
import { createChunkSession, chunkSessionStorageKey } from '../../../src/session/chunk-session.js';

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

  describe('atomic writes', () => {
    it('leaves no temp files behind after save()', () => {
      const root = mkdtempSync(join(tmpdir(), 'chunk-session-atomic-'));
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

      const filePath = store.save(session);
      store.save({ ...session, iterations: 1 });

      const planDir = join(root, 'demo-plan');
      const leftovers = readdirSync(planDir).filter((f) => join(planDir, f) !== filePath);
      expect(leftovers).toEqual([]);
    });

    it('never leaves a partially-written session file visible on disk', () => {
      const root = mkdtempSync(join(tmpdir(), 'chunk-session-torn-'));
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

      const filePath = store.save(session);
      // A file written via temp+rename is always fully valid JSON on disk —
      // if the process had crashed mid-write, the target path would still
      // hold the previous complete content (or not exist), never a torn one.
      expect(() => JSON.parse(readFileSync(filePath, 'utf-8'))).not.toThrow();
    });
  });

  describe('corruption handling', () => {
    function corruptedFilePath(root: string, planName: string, chunkId: string, taskId: string): string {
      return join(root, planName, `${chunkSessionStorageKey(chunkId, taskId)}.json`);
    }

    it('load() quarantines a corrupt session file and returns undefined instead of throwing', () => {
      const root = mkdtempSync(join(tmpdir(), 'chunk-session-corrupt-load-'));
      tmpDirs.push(root);
      const planDir = join(root, 'demo-plan');
      mkdirSync(planDir, { recursive: true });
      const filePath = corruptedFilePath(root, 'demo-plan', '01_demo', 'impl:01_demo');
      writeFileSync(filePath, '{"chunkId": "01_demo", "trans'); // truncated mid-write

      const store = new FileChunkSessionStore(root);

      expect(() => store.load('demo-plan', '01_demo', 'impl:01_demo')).not.toThrow();
      expect(store.load('demo-plan', '01_demo', 'impl:01_demo')).toBeUndefined();
      expect(existsSync(filePath)).toBe(false);
      expect(readdirSync(planDir).some((f) => f.includes('.corrupt.'))).toBe(true);
    });

    it('list() skips a corrupt session file and still returns the healthy ones', () => {
      const root = mkdtempSync(join(tmpdir(), 'chunk-session-corrupt-list-'));
      tmpDirs.push(root);
      const store = new FileChunkSessionStore(root);
      const good = createChunkSession({
        planName: 'demo-plan',
        taskId: 'impl:02_demo',
        chunkId: '02_demo',
        promiseTag: 'IMPL_02_demo_DONE',
        workingDir: root,
        provider: 'claude',
        maxTokens: 200000,
      });
      store.save(good);

      const planDir = join(root, 'demo-plan');
      const corruptPath = corruptedFilePath(root, 'demo-plan', '01_demo', 'impl:01_demo');
      writeFileSync(corruptPath, 'not valid json{{{');

      const sessions = store.list('demo-plan');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.chunkId).toBe('02_demo');
      expect(existsSync(corruptPath)).toBe(false);
      expect(readdirSync(planDir).some((f) => f.includes('.corrupt.'))).toBe(true);
    });
  });
});

describe('FileChunkSessionSnapshotStore', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeSession(root: string) {
    return createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_demo',
      chunkId: '01_demo',
      promiseTag: 'IMPL_01_demo_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });
  }

  it('writes snapshots atomically, leaving no temp files behind', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-atomic-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);

    const file = snapshots.writeSnapshot(session, 'pre-compaction');

    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const leftovers = readdirSync(dir).filter((f) => join(dir, f) !== file);
    expect(leftovers).toEqual([]);
    expect(() => JSON.parse(readFileSync(file, 'utf-8'))).not.toThrow();
  });

  it('restoreLatest() skips a corrupt snapshot file and returns undefined instead of throwing when none remain', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-corrupt-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    mkdirSync(dir, { recursive: true });
    const corruptPath = join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json');
    writeFileSync(corruptPath, '{"chunkId": "01_demo", "trunc');

    expect(() => snapshots.restoreLatest('demo-plan', '01_demo', session.taskId)).not.toThrow();
    expect(snapshots.restoreLatest('demo-plan', '01_demo', session.taskId)).toBeUndefined();
    expect(existsSync(corruptPath)).toBe(false);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt.'))).toBe(true);
  });

  it('restoreLatest() falls back to the next-most-recent snapshot when the latest is corrupt', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-fallback-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'),
      JSON.stringify({ ...session, compactionGeneration: 0 }),
    );
    const corruptPath = join(dir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json');
    writeFileSync(corruptPath, '{"chunkId": "01_demo", "trunc');

    const restored = snapshots.restoreLatest('demo-plan', '01_demo', session.taskId);

    expect(restored?.compactionGeneration).toBe(0);
    expect(existsSync(corruptPath)).toBe(false);
  });

  it('restoreLatest() without a taskId returns undefined when the chunk has snapshots for multiple tasks', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-ambiguous-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const implSession = makeSession(root);
    const hardenSession = {
      ...implSession,
      taskId: 'harden:01_demo',
      promiseTag: 'HARDEN_01_demo_DONE',
      compactionGeneration: 1,
    };
    const implDir = join(root, 'demo-plan', chunkSessionStorageKey(implSession.chunkId, implSession.taskId));
    const hardenDir = join(root, 'demo-plan', chunkSessionStorageKey(hardenSession.chunkId, hardenSession.taskId));
    mkdirSync(implDir, { recursive: true });
    mkdirSync(hardenDir, { recursive: true });
    writeFileSync(
      join(implDir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'),
      JSON.stringify(implSession),
    );
    writeFileSync(
      join(hardenDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'),
      JSON.stringify(hardenSession),
    );

    expect(snapshots.restoreLatest('demo-plan', '01_demo')).toBeUndefined();
    expect(snapshots.restoreLatest('demo-plan', '01_demo', implSession.taskId)?.promiseTag).toBe('IMPL_01_demo_DONE');
    expect(snapshots.restoreLatest('demo-plan', '01_demo', hardenSession.taskId)?.promiseTag).toBe('HARDEN_01_demo_DONE');
  });

  it('restoreLatest() without a taskId treats corrupt task-scoped snapshots as ambiguous', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-ambiguous-corrupt-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const implSession = makeSession(root);
    const hardenSession = {
      ...implSession,
      taskId: 'harden:01_demo',
      promiseTag: 'HARDEN_01_demo_DONE',
      compactionGeneration: 1,
    };
    const implDir = join(root, 'demo-plan', chunkSessionStorageKey(implSession.chunkId, implSession.taskId));
    const hardenDir = join(root, 'demo-plan', chunkSessionStorageKey(hardenSession.chunkId, hardenSession.taskId));
    mkdirSync(implDir, { recursive: true });
    mkdirSync(hardenDir, { recursive: true });
    writeFileSync(
      join(implDir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'),
      JSON.stringify(implSession),
    );
    const corruptPath = join(hardenDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json');
    writeFileSync(corruptPath, '{"chunkId": "01_demo", "trunc');

    expect(snapshots.restoreLatest('demo-plan', '01_demo')).toBeUndefined();
    expect(snapshots.restoreLatest('demo-plan', '01_demo', implSession.taskId)?.promiseTag).toBe('IMPL_01_demo_DONE');
    expect(snapshots.restoreLatest('demo-plan', '01_demo', hardenSession.taskId)).toBeUndefined();
    expect(existsSync(corruptPath)).toBe(false);
    expect(readdirSync(hardenDir).some((f) => f.includes('.corrupt.'))).toBe(true);
  });

  it('restoreLatest() without a taskId stays ambiguous after corrupt snapshots are quarantined', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-ambiguous-quarantined-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const implSession = makeSession(root);
    const hardenSession = {
      ...implSession,
      taskId: 'harden:01_demo',
      promiseTag: 'HARDEN_01_demo_DONE',
      compactionGeneration: 1,
    };
    const implDir = join(root, 'demo-plan', chunkSessionStorageKey(implSession.chunkId, implSession.taskId));
    const hardenDir = join(root, 'demo-plan', chunkSessionStorageKey(hardenSession.chunkId, hardenSession.taskId));
    mkdirSync(implDir, { recursive: true });
    mkdirSync(hardenDir, { recursive: true });
    writeFileSync(
      join(implDir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'),
      JSON.stringify(implSession),
    );
    writeFileSync(join(hardenDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');

    expect(snapshots.restoreLatest('demo-plan', '01_demo')).toBeUndefined();
    expect(snapshots.restoreLatest('demo-plan', '01_demo')).toBeUndefined();
    expect(readdirSync(hardenDir).some((f) => f.includes('.json.corrupt.'))).toBe(true);
  });

  it('restoreLatest() without a taskId ignores corrupt snapshots for unrelated chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-unrelated-corrupt-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);
    const otherSession = {
      ...session,
      taskId: 'impl:02_demo',
      chunkId: '02_demo',
      promiseTag: 'IMPL_02_demo_DONE',
    };
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const otherDir = join(root, 'demo-plan', chunkSessionStorageKey(otherSession.chunkId, otherSession.taskId));
    mkdirSync(dir, { recursive: true });
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'), JSON.stringify(session));
    writeFileSync(join(otherDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');

    expect(snapshots.restoreLatest('demo-plan', '01_demo')?.promiseTag).toBe('IMPL_01_demo_DONE');
  });

  it('restoreLatest() without a taskId falls back within one task when the latest snapshot is corrupt', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-unscoped-same-task-corrupt-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'),
      JSON.stringify({ ...session, compactionGeneration: 0 }),
    );
    writeFileSync(join(dir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');

    expect(snapshots.restoreLatest('demo-plan', '01_demo')?.compactionGeneration).toBe(0);
  });

  it('restoreLatest() without a taskId counts recovery-task corrupt snapshots as ambiguous', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-recovery-corrupt-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:01_types',
      chunkId: '01_types',
      promiseTag: 'IMPL_01_types_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });
    const recoverySession = {
      ...session,
      taskId: 'fix-harden:01_types-attempt-1',
      promiseTag: 'FIX_HARDEN_01_types_DONE',
    };
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const recoveryDir = join(root, 'demo-plan', chunkSessionStorageKey(recoverySession.chunkId, recoverySession.taskId));
    mkdirSync(dir, { recursive: true });
    mkdirSync(recoveryDir, { recursive: true });
    writeFileSync(join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'), JSON.stringify(session));
    writeFileSync(join(recoveryDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');

    expect(snapshots.restoreLatest('demo-plan', '01_types')).toBeUndefined();
  });

  it('restoreLatest() without a taskId counts opaque corrupt task snapshots as ambiguous', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-opaque-corrupt-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'task-1',
      chunkId: 'cli:01_demo',
      promiseTag: 'TASK_1_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });
    const otherTask = { ...session, taskId: 'task-2', promiseTag: 'TASK_2_DONE' };
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const otherDir = join(root, 'demo-plan', chunkSessionStorageKey(otherTask.chunkId, otherTask.taskId));
    mkdirSync(dir, { recursive: true });
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'), JSON.stringify(session));
    writeFileSync(join(otherDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');

    expect(snapshots.restoreLatest('demo-plan', 'cli:01_demo')).toBeUndefined();
  });

  it('restoreLatest() without a taskId ignores unrelated generated hyphenated corrupt chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-hyphenated-unrelated-corrupt-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:issue-2',
      chunkId: 'issue-2',
      promiseTag: 'ISSUE_2_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'), JSON.stringify(session));

    for (const [chunkId, taskId] of [
      ['issue-1', 'impl:issue-1'],
      ['define-types', 'impl:define-types'],
      ['issue-10/chunk-1', 'impl:issue-10/chunk-1'],
    ] as const) {
      const corruptDir = join(root, 'demo-plan', chunkSessionStorageKey(chunkId, taskId));
      mkdirSync(corruptDir, { recursive: true });
      writeFileSync(join(corruptDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');
    }

    expect(snapshots.restoreLatest('demo-plan', 'issue-2')?.promiseTag).toBe('ISSUE_2_DONE');
  });

  it('restoreLatest() without a taskId ignores unrelated single-token corrupt chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-single-token-unrelated-corrupt-task-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = createChunkSession({
      planName: 'demo-plan',
      taskId: 'impl:billing',
      chunkId: 'billing',
      promiseTag: 'BILLING_DONE',
      workingDir: root,
      provider: 'claude',
      maxTokens: 200000,
    });
    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const corruptDir = join(root, 'demo-plan', chunkSessionStorageKey('auth', 'impl:auth'));
    mkdirSync(dir, { recursive: true });
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(join(dir, '2026-01-01T00-00-00-000Z-gen-0-pre-compaction.json'), JSON.stringify(session));
    writeFileSync(join(corruptDir, '2026-01-02T00-00-00-000Z-gen-1-pre-compaction.json'), 'not valid json{{{');

    expect(snapshots.restoreLatest('demo-plan', 'billing')?.promiseTag).toBe('BILLING_DONE');
  });

  it('list() without a taskId skips a corrupt snapshot instead of throwing', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-list-corrupt-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);
    snapshots.writeSnapshot(session, 'pre-compaction');

    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const corruptPath = join(dir, '2026-01-03T00-00-00-000Z-gen-2-pre-compaction.json');
    writeFileSync(corruptPath, 'not valid json{{{');

    expect(() => snapshots.list('demo-plan', '01_demo')).not.toThrow();
    expect(snapshots.list('demo-plan', '01_demo')).toHaveLength(1);
  });

  it('list() with a taskId also quarantines a corrupt snapshot instead of returning it', () => {
    const root = mkdtempSync(join(tmpdir(), 'chunk-snapshot-list-task-corrupt-'));
    tmpDirs.push(root);
    const snapshots = new FileChunkSessionSnapshotStore(root);
    const session = makeSession(root);
    const goodFile = snapshots.writeSnapshot(session, 'pre-compaction');

    const dir = join(root, 'demo-plan', chunkSessionStorageKey(session.chunkId, session.taskId));
    const corruptPath = join(dir, '2026-01-03T00-00-00-000Z-gen-2-pre-compaction.json');
    writeFileSync(corruptPath, 'not valid json{{{');

    const files = snapshots.list('demo-plan', '01_demo', session.taskId);

    expect(files).toEqual([goodFile]);
    expect(existsSync(corruptPath)).toBe(false);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt.'))).toBe(true);
  });
});
