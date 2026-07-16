import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { diffStateSnapshotDirectories } from '../../../src/dr/state-snapshot-diff.js';

async function snapshotDir(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'state-snapshot-diff-'));
  for (const [relativePath, value] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  }
  return root;
}

describe('state snapshot diff', () => {
  it('redacts approval digests and opaque approval source filenames', async () => {
    const before = await snapshotDir({
      'approvals/8b7e-token-before.json': { id: 'approval-1', digest: 'sha256:backup-secret-token-before', decision: 'pending' },
    });
    const after = await snapshotDir({
      'approvals/8b7e-token-after.json': { id: 'approval-1', digest: 'sha256:backup-secret-token-after', decision: 'approved' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalChange = report.diffs.find((diff) => diff.subsystem === 'approvals')?.changed[0];
    const serialized = JSON.stringify(approvalChange);

    expect(approvalChange?.beforeSource).toMatch(/^approvals\/<sha256:[a-f0-9]{16}>$/u);
    expect(approvalChange?.afterSource).toMatch(/^approvals\/<sha256:[a-f0-9]{16}>$/u);
    expect(serialized).not.toContain('8b7e-token');
    expect(serialized).not.toContain('backup-secret-token');
    expect(serialized).toContain('"digest":"<redacted>"');
    expect(approvalChange?.changedFields).toContain('digest');
  });

  it('keys object worker snapshots by stable worker identity instead of array position', async () => {
    const before = await snapshotDir({
      'workers/state.json': { workers: [{ workerId: 'worker-a', status: 'idle' }, { workerId: 'worker-b', status: 'busy' }] },
    });
    const after = await snapshotDir({
      'workers/state.json': { workers: [{ workerId: 'worker-b', status: 'busy' }, { workerId: 'worker-a', status: 'idle' }] },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const workerDiff = report.diffs.find((diff) => diff.subsystem === 'workerIds');

    expect(workerDiff?.added).toHaveLength(0);
    expect(workerDiff?.removed).toHaveLength(0);
    expect(workerDiff?.changed).toHaveLength(0);
  });

  it('keeps path-scoped files visible even when payload has collection-like keys', async () => {
    const before = await snapshotDir({
      'memory/operator.json': { id: 'operator-memory', tasks: ['old'], note: 'before' },
    });
    const after = await snapshotDir({
      'memory/operator.json': { id: 'operator-memory', tasks: ['new'], note: 'after' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const memoryDiff = report.diffs.find((diff) => diff.subsystem === 'memory');

    expect(memoryDiff?.changed).toHaveLength(1);
    expect(memoryDiff?.changed[0]?.id).toBe('operator-memory');
    expect(memoryDiff?.changed[0]?.changedFields).toEqual(['note', 'tasks']);
    expect(report.diffs.find((diff) => diff.subsystem === 'tasks')?.changed).toHaveLength(0);
  });

  it('redacts approvalId values and hashes approval source fallbacks', async () => {
    const before = await snapshotDir({
      'approvals/opaque-before-token.json': { approvalId: 'approval-secret-before', decision: 'pending' },
      'approvals/opaque-path-token.json': { decision: 'pending' },
    });
    const after = await snapshotDir({
      'approvals/opaque-after-token.json': { approvalId: 'approval-secret-after', decision: 'approved' },
      'approvals/opaque-path-token-next.json': { decision: 'approved' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');
    const serialized = JSON.stringify(approvalDiff);

    expect(serialized).not.toContain('approval-secret');
    expect(serialized).not.toContain('opaque-path-token');
    expect(serialized).toContain('"approvalId":"<redacted>"');
    for (const change of [...approvalDiff?.added ?? [], ...approvalDiff?.removed ?? []]) {
      expect(change.id).toMatch(/^approval:[a-f0-9]{16}(?:#\d+)?$/u);
    }
  });

  it('preserves approval map keys when values are objects', async () => {
    const before = await snapshotDir({
      'approvals/state.json': { approvals: { tokenA: { id: 'approval-1', state: 'pending' } } },
    });
    const after = await snapshotDir({
      'approvals/state.json': { approvals: { tokenB: { id: 'approval-1', state: 'pending' } } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');

    expect(approvalDiff?.added).toHaveLength(1);
    expect(approvalDiff?.removed).toHaveLength(1);
    expect(approvalDiff?.changed).toHaveLength(0);
    expect(approvalDiff?.added[0]?.id).toMatch(/^approval:[a-f0-9]{16}$/u);
    expect(approvalDiff?.removed[0]?.id).toMatch(/^approval:[a-f0-9]{16}$/u);
  });

  it('does not double-count collection wrappers in generic JSONL files', async () => {
    const before = await snapshotDir({
      'tasks.jsonl': `${JSON.stringify({ tasks: [{ id: 'task-1', status: 'ready' }] })}\n`,
    });
    const after = await snapshotDir({
      'tasks.jsonl': `${JSON.stringify({ tasks: [{ id: 'task-1', status: 'done' }] })}\n`,
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(taskDiff?.changed).toHaveLength(1);
    expect(taskDiff?.changed[0]?.id).toBe('task-1');
    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
  });

  it('recognizes stable identity fields in path-scoped object files', async () => {
    const before = await snapshotDir({
      'workers/worker-a.json': { workerId: 'worker-a', status: 'idle' },
    });
    const after = await snapshotDir({
      'workers/worker-a.json': { workerId: 'worker-a', status: 'busy' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const workerDiff = report.diffs.find((diff) => diff.subsystem === 'workerIds');

    expect(workerDiff?.added).toHaveLength(0);
    expect(workerDiff?.removed).toHaveLength(0);
    expect(workerDiff?.changed).toHaveLength(1);
    expect(workerDiff?.changed[0]?.id).toBe('worker-a');
    expect(workerDiff?.changed[0]?.changedFields).toEqual(['status']);
  });

  it('normalizes Windows-style sources before redaction and generic collection detection', async () => {
    const before = await snapshotDir({
      'approvals\\opaque-before-token.json': { id: 'approval-1', digest: 'sha256:backup-secret-token-before', decision: 'pending' },
      'tasks\\state.json': { tasks: [{ id: 'task-1', status: 'ready' }] },
    });
    const after = await snapshotDir({
      'approvals\\opaque-after-token.json': { id: 'approval-1', digest: 'sha256:backup-secret-token-after', decision: 'approved' },
      'tasks\\state.json': { tasks: [{ id: 'task-1', status: 'done' }] },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalChange = report.diffs.find((diff) => diff.subsystem === 'approvals')?.changed[0];
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');
    const serialized = JSON.stringify(report);

    expect(approvalChange?.beforeSource).toMatch(/^approvals\/<sha256:[a-f0-9]{16}>$/u);
    expect(approvalChange?.afterSource).toMatch(/^approvals\/<sha256:[a-f0-9]{16}>$/u);
    expect(serialized).not.toContain('opaque-before-token');
    expect(serialized).not.toContain('opaque-after-token');
    expect(taskDiff?.changed).toHaveLength(1);
    expect(taskDiff?.changed[0]?.id).toBe('task-1');
    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
  });

  it('does not double-count subsystem-directory collection wrappers', async () => {
    const before = await snapshotDir({
      'tasks/export.json': { tasks: [{ id: 'task-1', status: 'ready' }] },
    });
    const after = await snapshotDir({
      'tasks/export.json': { tasks: [{ id: 'task-1', status: 'done' }] },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(taskDiff?.changed).toHaveLength(1);
    expect(taskDiff?.changed[0]?.id).toBe('task-1');
    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
  });

  it('uses path identity for single-record files with only mutable names', async () => {
    const before = await snapshotDir({
      'cron/job-1.json': { name: 'nightly backup', schedule: '0 1 * * *' },
    });
    const after = await snapshotDir({
      'cron/job-1.json': { name: 'daily backup', schedule: '0 1 * * *' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const cronDiff = report.diffs.find((diff) => diff.subsystem === 'cron');

    expect(cronDiff?.changed).toHaveLength(1);
    expect(cronDiff?.changed[0]?.id).toBe('cron/job-1.json');
    expect(cronDiff?.changed[0]?.changedFields).toEqual(['name']);
    expect(cronDiff?.added).toHaveLength(0);
    expect(cronDiff?.removed).toHaveLength(0);
  });

  it('redacts non-approval email identifiers and source paths', async () => {
    const before = await snapshotDir({
      'memory/alice@example.com.json': { note: 'before' },
      'memory/state.json': { memory: { 'bob@example.com': { note: 'old' } } },
    });
    const after = await snapshotDir({
      'memory/alice@example.com.json': { note: 'after' },
      'memory/state.json': { memory: { 'bob@example.com': { note: 'new' } } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const memoryDiff = report.diffs.find((diff) => diff.subsystem === 'memory');
    const serialized = JSON.stringify(memoryDiff);

    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('bob@example.com');
    expect(serialized).toContain('<redacted-email>');
    expect(memoryDiff?.changed.map((change) => change.id)).toContain('<redacted-email>');
  });

  it('masks password-only database URLs in redacted output', async () => {
    const secret = ['prod', 'Secret'].join('');
    const before = await snapshotDir({
      'cron/job-1.json': { id: 'job-1', redisUrl: `redis://:${secret}@cache:6379/0` },
    });
    const after = await snapshotDir({
      'cron/job-1.json': { id: 'job-1', redisUrl: `redis://:${secret}@cache:6379/1` },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const serialized = JSON.stringify(report.diffs.find((diff) => diff.subsystem === 'cron'));

    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('redis://:<redacted>@cache:6379');
  });

  it('keeps key context when redacting primitive memory maps', async () => {
    const secret = ['hunter', 'Two'].join('');
    const before = await snapshotDir({
      'memory/state.json': { password: secret, theme: 'dark' },
    });
    const after = await snapshotDir({
      'memory/state.json': { password: `${secret}-rotated`, theme: 'dark' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const serialized = JSON.stringify(report.diffs.find((diff) => diff.subsystem === 'memory'));

    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('"password":"<redacted>"');
  });

  it('honors subsystem directory segments before filename substrings', async () => {
    const before = await snapshotDir({
      'memory/task-notes.json': { id: 'memory-note-1', note: 'before' },
    });
    const after = await snapshotDir({
      'memory/task-notes.json': { id: 'memory-note-1', note: 'after' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const memoryDiff = report.diffs.find((diff) => diff.subsystem === 'memory');
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(memoryDiff?.changed).toHaveLength(1);
    expect(memoryDiff?.changed[0]?.id).toBe('memory-note-1');
    expect(taskDiff?.changed).toHaveLength(0);
  });

  it('lets real worker registry records replace task worker references', async () => {
    const before = await snapshotDir({
      'tasks/task-1.json': { id: 'task-1', workerId: 'worker-a', status: 'ready' },
      'workers/worker-a.json': { workerId: 'worker-a', status: 'idle' },
    });
    const after = await snapshotDir({
      'workers/worker-a.json': { workerId: 'worker-a', status: 'idle' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const workerDiff = report.diffs.find((diff) => diff.subsystem === 'workerIds');

    expect(workerDiff?.added).toHaveLength(0);
    expect(workerDiff?.removed).toHaveLength(0);
    expect(workerDiff?.changed).toHaveLength(0);
  });

  it('redacts sensitive snapshot source paths in parse errors', async () => {
    const before = await snapshotDir({
      'approvals/opaque-secret-token.json': '{',
    });
    const after = await snapshotDir({
      'approvals/opaque-secret-token.json': { decision: 'approved' },
    });

    try {
      await diffStateSnapshotDirectories(before, after);
      throw new Error('expected diffStateSnapshotDirectories to reject');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('opaque-secret-token');
      expect(message).toMatch(/approvals\/<sha256:[a-f0-9]{16}>/u);
    }
  });

  it('coalesces identical duplicate records from aggregate and per-record exports', async () => {
    const before = await snapshotDir({
      'tasks/index.json': { tasks: [{ id: 'task-1', status: 'ready' }] },
      'tasks/task-1.json': { id: 'task-1', status: 'ready' },
    });
    const after = await snapshotDir({
      'tasks/task-1.json': { id: 'task-1', status: 'ready' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
    expect(taskDiff?.changed).toHaveLength(0);
  });

  it('redacts approval primitive map keys from output payloads', async () => {
    const secretKey = 'mapApprovalTokenBefore123';
    const before = await snapshotDir({
      'approvals/state.json': { approvals: { [secretKey]: true } },
    });
    const after = await snapshotDir({
      'approvals/state.json': { approvals: { [secretKey]: false } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const serialized = JSON.stringify(report.diffs.find((diff) => diff.subsystem === 'approvals'));

    expect(serialized).not.toContain(secretKey);
    expect(serialized).toContain('"value":"<redacted>"');
  });



  it('splits direct approval primitive token maps into redacted records', async () => {
    const beforeToken = 'directApprovalTokenBefore123';
    const afterToken = 'directApprovalTokenAfter456';
    const before = await snapshotDir({
      'approvals.json': { [beforeToken]: true },
    });
    const after = await snapshotDir({
      'approvals.json': { [afterToken]: true },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');
    const serialized = JSON.stringify(approvalDiff);

    expect(approvalDiff?.added).toHaveLength(1);
    expect(approvalDiff?.removed).toHaveLength(1);
    expect(approvalDiff?.changed).toHaveLength(0);
    expect(approvalDiff?.added[0]?.id).toMatch(/^approval:[a-f0-9]{16}$/u);
    expect(approvalDiff?.removed[0]?.id).toMatch(/^approval:[a-f0-9]{16}$/u);
    expect(serialized).not.toContain(beforeToken);
    expect(serialized).not.toContain(afterToken);
    expect(serialized).toContain('"value":"<redacted>"');
  });

  it('uses file fallback identity for per-approval primitive files', async () => {
    const before = await snapshotDir({
      'approvals/token-before.json': { decision: 'pending' },
    });
    const after = await snapshotDir({
      'approvals/token-after.json': { decision: 'pending' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');

    expect(approvalDiff?.added).toHaveLength(1);
    expect(approvalDiff?.removed).toHaveLength(1);
    expect(approvalDiff?.changed).toHaveLength(0);
    expect(JSON.stringify(approvalDiff)).not.toContain('token-before');
    expect(JSON.stringify(approvalDiff)).not.toContain('token-after');
  });

  it('hashes raw approval source names before opaque literal masking', async () => {
    const before = await snapshotDir({
      'approvals/ghp_beforeToken1234567890.json': { id: 'approval-1', decision: 'pending' },
    });
    const after = await snapshotDir({
      'approvals/ghp_afterToken1234567890.json': { id: 'approval-1', decision: 'approved' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalChange = report.diffs.find((diff) => diff.subsystem === 'approvals')?.changed[0];

    expect(approvalChange?.beforeSource).toMatch(/^approvals\/<sha256:[a-f0-9]{16}>$/u);
    expect(approvalChange?.afterSource).toMatch(/^approvals\/<sha256:[a-f0-9]{16}>$/u);
    expect(approvalChange?.beforeSource).not.toBe(approvalChange?.afterSource);
  });

  it('redacts sensitive snapshot source paths in oversized file errors', async () => {
    const before = await snapshotDir({
      'approvals/oversized-secret-token.json': 'x'.repeat((4 * 1024 * 1024) + 1),
    });
    const after = await snapshotDir({
      'approvals/oversized-secret-token.json': { decision: 'approved' },
    });

    try {
      await diffStateSnapshotDirectories(before, after);
      throw new Error('expected diffStateSnapshotDirectories to reject');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('oversized-secret-token');
      expect(message).toMatch(/approvals\/<sha256:[a-f0-9]{16}>/u);
    }
  });

  it('prefers approval-token filenames over task-like parent directories', async () => {
    const before = await snapshotDir({
      'kanban/approval-tokens.json': ['approval-token-before'],
    });
    const after = await snapshotDir({
      'kanban/approval-tokens.json': ['approval-token-after'],
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');
    const serialized = JSON.stringify(report);

    expect(approvalDiff?.added).toHaveLength(1);
    expect(approvalDiff?.removed).toHaveLength(1);
    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
    expect(serialized).not.toContain('approval-token-before');
    expect(serialized).not.toContain('approval-token-after');
  });

  it('prefers stable card identity over mutable worker ownership for task records', async () => {
    const before = await snapshotDir({
      'tasks/card-1.json': { cardId: 'card-1', workerId: 'worker-a', status: 'running' },
    });
    const after = await snapshotDir({
      'tasks/card-1.json': { cardId: 'card-1', workerId: 'worker-b', status: 'running' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
    expect(taskDiff?.changed).toHaveLength(1);
    expect(taskDiff?.changed[0]?.id).toBe('card-1');
    expect(taskDiff?.changed[0]?.changedFields).toEqual(['workerId']);
  });

  it('does not diff aggregate wrapper metadata as records', async () => {
    const before = await snapshotDir({
      'tasks/export.json': { id: 'export-before', tasks: [{ id: 'task-1', status: 'ready' }] },
    });
    const after = await snapshotDir({
      'tasks/export.json': { id: 'export-after', tasks: [{ id: 'task-1', status: 'ready' }] },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
    expect(taskDiff?.changed).toHaveLength(0);
  });


  it('redacts sensitive non-approval source names in parse errors', async () => {
    const before = await snapshotDir({
      'tasks/token=PathSecret123.json': '{',
    });
    const after = await snapshotDir({
      'tasks/token=PathSecret123.json': { id: 'task-1', status: 'ready' },
    });

    try {
      await diffStateSnapshotDirectories(before, after);
      throw new Error('expected diffStateSnapshotDirectories to reject');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('token=PathSecret123');
      expect(message).toContain('token=<redacted>');
    }
  });

  it('keeps explicit subsystem directories authoritative over generic filenames', async () => {
    const before = await snapshotDir({
      'memory/state.json': { id: 'memory-1', tasks: ['old'], note: 'before' },
    });
    const after = await snapshotDir({
      'memory/state.json': { id: 'memory-1', tasks: ['new'], note: 'after' },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const memoryDiff = report.diffs.find((diff) => diff.subsystem === 'memory');
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(memoryDiff?.changed).toHaveLength(1);
    expect(memoryDiff?.changed[0]?.id).toBe('memory-1');
    expect(memoryDiff?.changed[0]?.changedFields).toEqual(['note', 'tasks']);
    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
    expect(taskDiff?.changed).toHaveLength(0);
  });

  it('redacts sensitive snapshot root paths on load failures', async () => {
    const before = await snapshotDir({
      'tasks.json': [{ id: 'task-1', status: 'ready' }],
    });
    const missingAfter = join(before, '..', 'token=PathSecret123-missing');

    try {
      await diffStateSnapshotDirectories(before, missingAfter);
      throw new Error('expected diffStateSnapshotDirectories to reject');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('token=PathSecret123');
      expect(message).toContain('ENOENT');
    }
  });


  it('redacts sensitive changed field names and successful root paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'franken-dr-token=PathSecret123-'));
    const before = join(root, 'before');
    const after = join(root, 'after');

    try {
      await mkdir(before, { recursive: true });
      await mkdir(after, { recursive: true });
      await writeFile(join(before, 'memory.json'), JSON.stringify({ 'user@example.com': 'old' }), 'utf8');
      await writeFile(join(after, 'memory.json'), JSON.stringify({ 'user@example.com': 'new' }), 'utf8');

      const report = await diffStateSnapshotDirectories(before, after);
      const serialized = JSON.stringify(report);
      const memoryDiff = report.diffs.find((diff) => diff.subsystem === 'memory');

      expect(serialized).not.toContain('token=PathSecret123');
      expect(serialized).toContain('token=<redacted>');
      expect(memoryDiff?.changed[0]?.changedFields).toEqual(['<redacted-email>']);
      expect(serialized).not.toContain('user@example.com');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });


  it('uses task map fallback identities before mutable worker ids', async () => {
    const before = await snapshotDir({
      'tasks.json': { 'task-1': { workerId: 'worker-a', status: 'running' } },
    });
    const after = await snapshotDir({
      'tasks.json': { 'task-1': { workerId: 'worker-b', status: 'running' } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const taskDiff = report.diffs.find((diff) => diff.subsystem === 'tasks');

    expect(taskDiff?.added).toHaveLength(0);
    expect(taskDiff?.removed).toHaveLength(0);
    expect(taskDiff?.changed).toHaveLength(1);
    expect(taskDiff?.changed[0]?.id).toBe('task-1');
  });

  it('redacts token-keyed primitive approval maps from non-generic approval files', async () => {
    const beforeToken = 'pendingApprovalTokenBefore123';
    const afterToken = 'pendingApprovalTokenAfter456';
    const before = await snapshotDir({
      'approvals/pending.json': { [beforeToken]: true },
    });
    const after = await snapshotDir({
      'approvals/pending.json': { [afterToken]: true },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const serialized = JSON.stringify(report);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');

    expect(approvalDiff?.added).toHaveLength(1);
    expect(approvalDiff?.removed).toHaveLength(1);
    expect(serialized).not.toContain(beforeToken);
    expect(serialized).not.toContain(afterToken);
    expect(serialized).toContain('"value":"<redacted>"');
  });

  it('does not echo malformed snapshot contents in parse errors', async () => {
    const leakedPrefix = 'approval-token-prefix-Secret123';
    const before = await snapshotDir({
      'approvals/broken.jsonl': `{"token":"${leakedPrefix}",\n`,
    });
    const after = await snapshotDir({
      'approvals/broken.jsonl': { decision: 'approved' },
    });

    try {
      await diffStateSnapshotDirectories(before, after);
      throw new Error('expected diffStateSnapshotDirectories to reject');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('invalid JSON');
      expect(message).not.toContain(leakedPrefix);
      expect(message).not.toContain('"token"');
    }
  });

  it('uses file identity for path-scoped single-record objects with nested fields', async () => {
    const before = await snapshotDir({
      'memory/operator.json': { profile: { name: 'operator' }, settings: { theme: 'dark' } },
    });
    const after = await snapshotDir({
      'memory/operator.json': { profile: { name: 'operator' }, settings: { theme: 'light' } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const memoryDiff = report.diffs.find((diff) => diff.subsystem === 'memory');

    expect(memoryDiff?.added).toHaveLength(0);
    expect(memoryDiff?.removed).toHaveLength(0);
    expect(memoryDiff?.changed).toHaveLength(1);
    expect(memoryDiff?.changed[0]?.id).toBe('memory/operator.json');
    expect(memoryDiff?.changed[0]?.changedFields).toEqual(['settings']);
  });

  it('uses non-worker map keys before mutable worker owners', async () => {
    const before = await snapshotDir({
      'cron/jobs.json': { jobs: { 'job-1': { workerId: 'worker-a', schedule: '0 1 * * *' } } },
    });
    const after = await snapshotDir({
      'cron/jobs.json': { jobs: { 'job-1': { workerId: 'worker-b', schedule: '0 1 * * *' } } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const cronDiff = report.diffs.find((diff) => diff.subsystem === 'cron');

    expect(cronDiff?.added).toHaveLength(0);
    expect(cronDiff?.removed).toHaveLength(0);
    expect(cronDiff?.changed).toHaveLength(1);
    expect(cronDiff?.changed[0]?.id).toBe('job-1');
    expect(cronDiff?.changed[0]?.changedFields).toEqual(['workerId']);
  });

  it('splits direct worker maps by worker id', async () => {
    const before = await snapshotDir({
      'workers.json': { 'worker-a': { status: 'idle' }, 'worker-b': { status: 'busy' } },
    });
    const after = await snapshotDir({
      'workers.json': { 'worker-a': { status: 'idle' }, 'worker-c': { status: 'busy' } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const workerDiff = report.diffs.find((diff) => diff.subsystem === 'workerIds');

    expect(workerDiff?.added.map((change) => change.id)).toEqual(['worker-c']);
    expect(workerDiff?.removed.map((change) => change.id)).toEqual(['worker-b']);
    expect(workerDiff?.changed).toHaveLength(0);
  });

  it('splits object-valued approval maps without leaking token keys', async () => {
    const beforeToken = 'objectApprovalTokenBefore123';
    const afterToken = 'objectApprovalTokenAfter456';
    const before = await snapshotDir({
      'approvals/pending.json': { [beforeToken]: { decision: 'pending' } },
    });
    const after = await snapshotDir({
      'approvals/pending.json': { [afterToken]: { decision: 'approved' } },
    });

    const report = await diffStateSnapshotDirectories(before, after);
    const serialized = JSON.stringify(report);
    const approvalDiff = report.diffs.find((diff) => diff.subsystem === 'approvals');

    expect(approvalDiff?.added).toHaveLength(1);
    expect(approvalDiff?.removed).toHaveLength(1);
    expect(approvalDiff?.changed).toHaveLength(0);
    expect(serialized).not.toContain(beforeToken);
    expect(serialized).not.toContain(afterToken);
  });

});
