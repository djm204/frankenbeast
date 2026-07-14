import { describe, expect, it } from 'vitest';
import {
  detectRestorePreviewConflicts,
  type RestorePreviewManifest,
} from '../../../src/dr/restore-preview.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('restore preview conflict detector', () => {
  it('returns a clean no-write preview when backup manifest matches live state', () => {
    const backup: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'task-digest', updatedAt: '2026-07-14T10:00:00.000Z' }],
      approvals: [{ id: 'approval-1', state: 'pending', digest: 'approval-digest' }],
      memory: [{ id: 'memory:user', digest: 'memory-digest' }],
      cron: [{ id: 'daily-brief', digest: 'cron-digest' }],
    };
    const live = clone(backup);
    const beforeBackup = clone(backup);
    const beforeLive = clone(live);

    const preview = detectRestorePreviewConflicts(backup, live);

    expect(preview.safeToRestore).toBe(true);
    expect(preview.wouldWrite).toBe(false);
    expect(preview.conflicts).toEqual([]);
    expect(backup).toEqual(beforeBackup);
    expect(live).toEqual(beforeLive);
  });

  it('reports task, approval, memory, and cron conflicts with recommended actions', () => {
    const backup: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'old-task', updatedAt: '2026-07-14T10:00:00.000Z' }],
      approvals: [{ id: 'approval-1', state: 'pending', digest: 'pending-token' }],
      memory: [{ id: 'memory:user', digest: 'old-memory' }],
      cron: [{ id: 'daily-brief', digest: 'old-cron' }],
    };
    const live: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [
        { id: 'task-1', digest: 'new-task', updatedAt: '2026-07-14T11:00:00.000Z' },
        { id: 'task-2', digest: 'live-only', updatedAt: '2026-07-14T11:30:00.000Z' },
      ],
      approvals: [{ id: 'approval-1', state: 'approved', digest: 'approved-token' }],
      memory: [{ id: 'memory:user', digest: 'new-memory' }],
      cron: [
        { id: 'daily-brief', digest: 'new-cron' },
        { id: 'hourly-watchdog', digest: 'live-only-cron' },
      ],
    };

    const preview = detectRestorePreviewConflicts(backup, live);

    expect(preview.safeToRestore).toBe(false);
    expect(preview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'tasks', id: 'task-1', type: 'newer-live', recommendation: expect.stringContaining('merge') }),
        expect.objectContaining({ area: 'tasks', id: 'task-2', type: 'live-only', recommendation: expect.stringContaining('preserve') }),
        expect.objectContaining({ area: 'approvals', id: 'approval-1', type: 'changed', recommendation: expect.stringContaining('re-approval') }),
        expect.objectContaining({ area: 'memory', id: 'memory:user', type: 'changed', recommendation: expect.stringContaining('merge') }),
        expect.objectContaining({ area: 'cron', id: 'daily-brief', type: 'changed', recommendation: expect.stringContaining('explicitly restore') }),
        expect.objectContaining({ area: 'cron', id: 'hourly-watchdog', type: 'live-only', recommendation: expect.stringContaining('preserve') }),
      ]),
    );
  });

  it('treats backup-only approval tokens as blockers', () => {
    const preview = detectRestorePreviewConflicts(
      {
        schemaVersion: 1,
        tasks: [],
        approvals: [{ id: 'approval-cleared-live', state: 'approved', digest: 'stale-token' }],
        memory: [],
        cron: [],
      },
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
    );

    expect(preview.safeToRestore).toBe(false);
    expect(preview.conflicts).toContainEqual(
      expect.objectContaining({
        area: 'approvals',
        id: 'approval-cleared-live',
        type: 'backup-only',
        severity: 'blocker',
        recommendation: expect.stringContaining('re-approval'),
      }),
    );
  });

  it('compares digest, state, and timestamps so metadata drift is not hidden', () => {
    const preview = detectRestorePreviewConflicts(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-1', digest: 'same-task-body', updatedAt: '2026-07-14T10:00:00.000Z' }],
        approvals: [{ id: 'approval-1', state: 'pending', digest: 'same-token' }],
        memory: [],
        cron: [],
      },
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-1', digest: 'same-task-body', updatedAt: '2026-07-14T11:00:00.000Z' }],
        approvals: [{ id: 'approval-1', state: 'approved', digest: 'same-token' }],
        memory: [],
        cron: [],
      },
    );

    expect(preview.safeToRestore).toBe(false);
    expect(preview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'tasks', id: 'task-1', type: 'newer-live' }),
        expect.objectContaining({ area: 'approvals', id: 'approval-1', type: 'changed', severity: 'blocker' }),
      ]),
    );
  });

  it('blocks preview when backup and live schema versions differ', () => {
    const preview = detectRestorePreviewConflicts(
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      { schemaVersion: 2, tasks: [], approvals: [], memory: [], cron: [] },
    );

    expect(preview.safeToRestore).toBe(false);
    expect(preview.schema.compatible).toBe(false);
    expect(preview.conflicts).toContainEqual(
      expect.objectContaining({
        area: 'schema',
        id: 'schema-version',
        type: 'schema-mismatch',
        severity: 'blocker',
        recommendation: expect.stringContaining('Do not restore'),
      }),
    );
  });
});
