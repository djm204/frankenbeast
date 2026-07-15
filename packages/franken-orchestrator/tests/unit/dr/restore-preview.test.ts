import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  buildBackupEncryptionVerificationReport,
  detectRestorePreviewConflicts,
  type RestorePreviewManifest,
} from '../../../src/dr/restore-preview.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MissingCronJobRecoveryFixture {
  readonly description: string;
  readonly backup: RestorePreviewManifest;
  readonly live: RestorePreviewManifest;
  readonly expectedConflict: {
    readonly area: 'cron';
    readonly id: string;
    readonly type: 'backup-only';
    readonly severity: 'info';
    readonly recommendationIncludes: string;
  };
}

function readMissingCronJobRecoveryFixture(): MissingCronJobRecoveryFixture {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'missing-cron-job-recovery.json'), 'utf8'),
  ) as MissingCronJobRecoveryFixture;
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

  it('loads the missing cron job recovery fixture as an explicit backup-only cron conflict', () => {
    const fixture = readMissingCronJobRecoveryFixture();
    const preview = detectRestorePreviewConflicts(fixture.backup, fixture.live);

    expect(fixture.description).toContain('missing from live state');
    expect(preview.safeToRestore).toBe(false);
    expect(preview.wouldWrite).toBe(false);
    expect(preview.conflicts).toContainEqual(
      expect.objectContaining({
        area: fixture.expectedConflict.area,
        id: fixture.expectedConflict.id,
        type: fixture.expectedConflict.type,
        severity: fixture.expectedConflict.severity,
        backup: expect.objectContaining({ state: 'enabled' }),
        recommendation: expect.stringContaining(fixture.expectedConflict.recommendationIncludes),
      }),
    );
    expect(preview.conflicts).not.toContainEqual(expect.objectContaining({ type: 'live-only' }));
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

  it('reports verified backup encryption metadata for operator handoff', () => {
    const manifest: RestorePreviewManifest = {
      schemaVersion: 1,
      encryption: {
        encrypted: true,
        algorithm: 'aes-256-gcm',
        keyRef: 'dr/backups/prod-primary',
        artifactDigest: 'sha256:abcdef',
        generatedAt: '2026-07-14T12:00:00.000Z',
      },
      tasks: [],
      approvals: [],
      memory: [],
      cron: [],
    };

    const before = clone(manifest);
    const report = buildBackupEncryptionVerificationReport(manifest, {
      checkedAt: '2026-07-14T12:30:00.000Z',
    });

    expect(report).toEqual({
      checkedAt: '2026-07-14T12:30:00.000Z',
      status: 'verified',
      encrypted: true,
      metadata: manifest.encryption,
      findings: [],
      operatorSummary: 'Backup encryption is verified; no encryption blockers or warnings were found.',
    });
    expect(manifest).toEqual(before);
  });

  it('fails backup encryption verification when encryption metadata is missing', () => {
    const report = buildBackupEncryptionVerificationReport(
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('failed');
    expect(report.encrypted).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'missing-encryption-metadata',
        severity: 'blocker',
        recommendation: expect.stringContaining('regenerate'),
      }),
    );
  });

  it('fails closed when loaded encryption metadata has a non-boolean encrypted flag', () => {
    const report = buildBackupEncryptionVerificationReport(
      {
        schemaVersion: 1,
        encryption: {
          encrypted: 'false',
          algorithm: 'aes-256-gcm',
          keyRef: 'dr/backups/prod-primary',
          artifactDigest: 'sha256:abcdef',
        } as unknown as RestorePreviewManifest['encryption'],
        tasks: [],
        approvals: [],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('failed');
    expect(report.encrypted).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: 'backup-not-encrypted', severity: 'blocker' }),
    );
  });

  it('returns findings instead of throwing when loaded encryption metadata has non-string fields', () => {
    const report = buildBackupEncryptionVerificationReport(
      {
        schemaVersion: 1,
        encryption: {
          encrypted: true,
          algorithm: 1,
          keyRef: ['dr/backups/prod-primary'],
          artifactDigest: { sha256: 'abcdef' },
        } as unknown as RestorePreviewManifest['encryption'],
        tasks: [],
        approvals: [],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('failed');
    expect(report.encrypted).toBe(true);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-algorithm', severity: 'blocker' }),
        expect.objectContaining({ code: 'missing-key-reference', severity: 'warning' }),
        expect.objectContaining({ code: 'missing-artifact-digest', severity: 'warning' }),
      ]),
    );
  });

  it('warns when encryption is present but the report lacks restore-critical references', () => {
    const report = buildBackupEncryptionVerificationReport(
      {
        schemaVersion: 1,
        encryption: {
          encrypted: true,
          algorithm: 'aes-128-cbc',
          keyRef: '',
          artifactDigest: '',
        },
        tasks: [],
        approvals: [],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('warning');
    expect(report.encrypted).toBe(true);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-algorithm', severity: 'warning' }),
        expect.objectContaining({ code: 'missing-key-reference', severity: 'warning' }),
        expect.objectContaining({ code: 'missing-artifact-digest', severity: 'warning' }),
      ]),
    );
  });
});
