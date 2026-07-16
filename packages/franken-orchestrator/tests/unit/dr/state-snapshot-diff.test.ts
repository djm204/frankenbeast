import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
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
});
