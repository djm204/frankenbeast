import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  buildApprovalLedgerRecoveryReport,
  buildBackupEncryptionVerificationReport,
  buildPointInTimeBackupManifest,
  buildRestoreDryRunReport,
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
  it('builds a deterministic point-in-time manifest with record counts for every restore area', () => {
    const backup: RestorePreviewManifest = {
      schemaVersion: 1,
      encryption: {
        encrypted: true,
        algorithm: 'aes-256-gcm',
        keyRef: 'dr/backups/prod-primary',
        artifactDigest: 'sha256:archive',
      },
      tasks: [{ id: 'task-1', digest: 'task-digest', value: { nested: ['kept'] } }],
      approvals: [{ id: 'approval-1', state: 'pending', digest: 'approval-digest' }],
      memory: [],
    };
    const before = clone(backup);

    const manifest = buildPointInTimeBackupManifest(backup, {
      capturedAt: '2026-07-14T12:00:00.000Z',
      generatedAt: '2026-07-14T12:05:00.000Z',
      source: 'prod-primary',
      manifestDigest: 'sha256:manifest',
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-07-14T12:05:00.000Z',
      pointInTime: {
        capturedAt: '2026-07-14T12:00:00.000Z',
        generatedAt: '2026-07-14T12:05:00.000Z',
        source: 'prod-primary',
        includedAreas: ['tasks', 'approvals', 'memory', 'cron'],
        recordCounts: {
          tasks: 1,
          approvals: 1,
          memory: 0,
          cron: 0,
        },
        manifestDigest: 'sha256:manifest',
      },
      encryption: backup.encryption,
      tasks: backup.tasks,
      approvals: backup.approvals,
      memory: [],
      cron: [],
    });
    expect(manifest.pointInTime.includedAreas).toEqual(['tasks', 'approvals', 'memory', 'cron']);
    expect(backup).toEqual(before);
  });

  it('fails explicitly when point-in-time metadata would claim a future capture', () => {
    expect(() =>
      buildPointInTimeBackupManifest(
        { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
        {
          capturedAt: '2026-07-14T12:10:00.000Z',
          generatedAt: '2026-07-14T12:05:00.000Z',
        },
      ),
    ).toThrow('capturedAt must not be later than generatedAt');
  });

  it('fails explicitly when point-in-time timestamps are malformed', () => {
    expect(() =>
      buildPointInTimeBackupManifest(
        { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
        { capturedAt: 'not-a-timestamp', generatedAt: '2026-07-14T12:05:00.000Z' },
      ),
    ).toThrow('capturedAt must be a valid ISO timestamp');
  });

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

  it('builds deterministic restore dry-run JSON output for automation', () => {
    const backup: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'old-task', updatedAt: '2026-07-14T10:00:00.000Z' }],
      approvals: [{ id: 'approval-1', state: 'pending', digest: 'pending-token', value: 'secret-token-value' }],
      memory: [],
      cron: [],
    };
    const live: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'new-task', updatedAt: '2026-07-14T11:00:00.000Z' }],
      approvals: [],
      memory: [{ id: 'memory:user', digest: 'live-only-memory' }],
      cron: [],
    };

    const report = buildRestoreDryRunReport(backup, live, {
      generatedAt: '2026-07-14T12:30:00.000Z',
      backupPath: '/backups/manifest.json',
      livePath: '/state/live-manifest.json',
    });

    expect(report).toEqual({
      ok: true,
      command: 'dr restore-dry-run',
      formatVersion: 1,
      generatedAt: '2026-07-14T12:30:00.000Z',
      dryRun: true,
      wouldWrite: false,
      inputs: {
        backupPath: '/backups/manifest.json',
        livePath: '/state/live-manifest.json',
      },
      summary: {
        safeToRestore: false,
        conflictCount: 3,
        blockerCount: 1,
        warningCount: 1,
        infoCount: 1,
      },
      preview: expect.objectContaining({
        wouldWrite: false,
        safeToRestore: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            area: 'tasks',
            backup: expect.objectContaining({ id: 'task-1', digestPresent: true }),
          }),
          expect.objectContaining({
            area: 'approvals',
            backup: { id: 'approval-1', state: 'pending', digestPresent: true, valuePresent: true },
          }),
        ]),
      }),
      operatorGuidance: expect.stringContaining('do not execute restore'),
    });
    expect(JSON.stringify(report)).not.toContain('secret-token-value');
    expect(JSON.stringify(report)).not.toContain('pending-token');
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

  it('blocks backup-only Kanban cards so restore cannot resurrect deleted live work silently', () => {
    const preview = detectRestorePreviewConflicts(
      {
        schemaVersion: 1,
        tasks: [
          {
            id: 't_deleted_live',
            state: 'running',
            digest: 'stale-card-body',
            updatedAt: '2026-07-14T09:00:00.000Z',
          },
        ],
        approvals: [],
        memory: [],
        cron: [],
      },
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
    );

    expect(preview.safeToRestore).toBe(false);
    expect(preview.conflicts).toContainEqual(
      expect.objectContaining({
        area: 'tasks',
        id: 't_deleted_live',
        type: 'backup-only',
        severity: 'blocker',
        recommendation: expect.stringContaining('Do not resurrect'),
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

  it('fails backup encryption verification instead of throwing when encryption metadata is null', () => {
    const report = buildBackupEncryptionVerificationReport(
      {
        schemaVersion: 1,
        encryption: null,
        tasks: [],
        approvals: [],
        memory: [],
        cron: [],
      } as unknown as RestorePreviewManifest,
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('failed');
    expect(report.encrypted).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: 'missing-encryption-metadata', severity: 'blocker' }),
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

  it('returns a clean read-only approval ledger recovery report when approvals match', () => {
    const backup: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [],
      approvals: [{ id: 'approval-1', state: 'approved', digest: 'sha256:approval', updatedAt: '2026-07-14T12:00:00.000Z' }],
      memory: [],
      cron: [],
    };

    const report = buildApprovalLedgerRecoveryReport(backup, clone(backup), {
      checkedAt: '2026-07-14T12:30:00.000Z',
    });

    expect(report).toEqual({
      checkedAt: '2026-07-14T12:30:00.000Z',
      wouldWrite: false,
      status: 'clean',
      safeToApplyAutomatically: false,
      findings: [],
      operatorSummary: 'Approval ledger recovery check is clean; no approval ledger drift was found.',
    });
  });

  it('blocks approval ledger recovery for stale backup-only approval tokens', () => {
    const report = buildApprovalLedgerRecoveryReport(
      {
        schemaVersion: 1,
        tasks: [],
        approvals: [{ id: 'approval-stale', state: 'approved', digest: 'sha256:stale-token' }],
        memory: [],
        cron: [],
      },
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('blocked');
    expect(report.safeToApplyAutomatically).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'approval-backup-only',
        approvalId: 'approval-stale',
        severity: 'blocker',
        backup: { state: 'approved', digestPresent: true },
        recommendation: expect.stringContaining('fresh human re-approval'),
      }),
    );
  });

  it('blocks changed approval ledger entries without echoing token values', () => {
    const report = buildApprovalLedgerRecoveryReport(
      {
        schemaVersion: 1,
        tasks: [],
        approvals: [{ id: 'approval-drift', state: 'pending', digest: 'sha256:backup-secret-token', updatedAt: '2026-07-14T11:00:00.000Z' }],
        memory: [],
        cron: [],
      },
      {
        schemaVersion: 1,
        tasks: [],
        approvals: [{ id: 'approval-drift', state: 'approved', digest: 'sha256:live-secret-token', updatedAt: '2026-07-14T12:00:00.000Z' }],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('blocked');
    expect(JSON.stringify(report)).not.toContain('secret-token');
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'approval-newer-live',
        approvalId: 'approval-drift',
        severity: 'blocker',
        backup: { state: 'pending', digestPresent: true, updatedAt: '2026-07-14T11:00:00.000Z' },
        live: { state: 'approved', digestPresent: true, updatedAt: '2026-07-14T12:00:00.000Z' },
        recommendation: expect.stringContaining('fresh re-approval'),
      }),
    );
  });

  it('surfaces live-only approval ledger entries as operator review warnings', () => {
    const report = buildApprovalLedgerRecoveryReport(
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      {
        schemaVersion: 1,
        tasks: [],
        approvals: [{ id: 'approval-live', state: 'approved', digest: 'sha256:live-token' }],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('review-required');
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'approval-live-only',
        approvalId: 'approval-live',
        severity: 'warning',
        live: { state: 'approved', digestPresent: true },
        recommendation: expect.stringContaining('Preserve the live approval ledger entry'),
      }),
    );
  });
});
