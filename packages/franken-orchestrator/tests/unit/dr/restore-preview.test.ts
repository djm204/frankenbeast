import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  buildApprovalLedgerRecoveryReport,
  buildBackupEncryptionVerificationReport,
  buildCrossFileStateConsistencyReport,
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
  it('builds a deterministic point-in-time manifest with record counts for explicitly captured restore areas', () => {
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
        includedAreas: ['tasks', 'approvals', 'memory'],
        recordCounts: {
          tasks: 1,
          approvals: 1,
          memory: 0,
        },
        manifestDigest: 'sha256:manifest',
      },
      encryption: backup.encryption,
      tasks: backup.tasks,
      approvals: backup.approvals,
      memory: [],
    });
    expect(manifest.pointInTime.includedAreas).toEqual(['tasks', 'approvals', 'memory']);
    expect(manifest).not.toHaveProperty('cron');
    expect(backup).toEqual(before);
  });

  it('distinguishes explicitly captured empty areas from omitted partial-backup areas', () => {
    const manifest = buildPointInTimeBackupManifest(
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      {
        capturedAt: '2026-07-14T12:00:00.000Z',
        generatedAt: '2026-07-14T12:05:00.000Z',
      },
    );

    expect(manifest.pointInTime.includedAreas).toEqual(['tasks', 'approvals', 'memory', 'cron']);
    expect(manifest.pointInTime.recordCounts).toEqual({ tasks: 0, approvals: 0, memory: 0, cron: 0 });
    expect(manifest.cron).toEqual([]);
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

  it('fails explicitly when point-in-time timestamps are malformed or normalized by JavaScript', () => {
    expect(() =>
      buildPointInTimeBackupManifest(
        { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
        { capturedAt: 'not-a-timestamp', generatedAt: '2026-07-14T12:05:00.000Z' },
      ),
    ).toThrow('capturedAt must be a valid canonical ISO timestamp');

    expect(() =>
      buildPointInTimeBackupManifest(
        { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
        { capturedAt: '2026-02-30T00:00:00.000Z', generatedAt: '2026-03-02T00:00:00.000Z' },
      ),
    ).toThrow('capturedAt must be a valid canonical ISO timestamp');
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
    expect(preview.mode).toBe('normal');
    expect(preview.destructiveActions.enabled).toBe(true);
    expect(preview.destructiveActions.blocked).toEqual([]);
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

  it('disables destructive restore actions when recovery mode is enabled', () => {
    const preview = detectRestorePreviewConflicts(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-1', digest: 'old-task', updatedAt: '2026-07-14T10:00:00.000Z' }],
        approvals: [{ id: 'approval-1', state: 'pending', digest: 'pending-token' }],
        memory: [],
        cron: [],
      },
      {
        schemaVersion: 1,
        tasks: [
          { id: 'task-1', digest: 'new-task', updatedAt: '2026-07-14T11:00:00.000Z' },
          { id: 'task-2', digest: 'live-only', updatedAt: '2026-07-14T11:30:00.000Z' },
        ],
        approvals: [{ id: 'approval-1', state: 'approved', digest: 'approved-token' }],
        memory: [],
        cron: [],
      },
      { recoveryMode: true },
    );

    expect(preview.mode).toBe('recovery');
    expect(preview.wouldWrite).toBe(false);
    expect(preview.destructiveActions.enabled).toBe(false);
    expect(preview.destructiveActions.guidance).toContain('destructive restore actions are disabled');
    expect(preview.destructiveActions.blocked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'tasks', id: 'task-1', type: 'overwrite-live-record' }),
        expect.objectContaining({ area: 'tasks', id: 'task-2', type: 'delete-live-record' }),
        expect.objectContaining({ area: 'approvals', id: 'approval-1', type: 'restore-approval-token' }),
      ]),
    );
  });

  it('keeps clean recovery-mode previews read-only with no blocked destructive actions', () => {
    const backup: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'task-digest', updatedAt: '2026-07-14T10:00:00.000Z' }],
      approvals: [],
      memory: [],
      cron: [],
    };

    const preview = detectRestorePreviewConflicts(backup, clone(backup), { recoveryMode: true });

    expect(preview.safeToRestore).toBe(true);
    expect(preview.mode).toBe('recovery');
    expect(preview.destructiveActions.enabled).toBe(false);
    expect(preview.destructiveActions.blocked).toEqual([]);
  });

  it('keeps backup-only task, memory, and cron records non-destructive in recovery mode', () => {
    const preview = detectRestorePreviewConflicts(
      {
        schemaVersion: 1,
        tasks: [{ id: 'missing-task', digest: 'task-digest' }],
        approvals: [],
        memory: [{ id: 'missing-memory', digest: 'memory-digest' }],
        cron: [{ id: 'missing-cron', digest: 'cron-digest' }],
      },
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      { recoveryMode: true },
    );

    expect(preview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'tasks', id: 'missing-task', type: 'backup-only' }),
        expect.objectContaining({ area: 'memory', id: 'missing-memory', type: 'backup-only' }),
        expect.objectContaining({ area: 'cron', id: 'missing-cron', type: 'backup-only' }),
      ]),
    );
    expect(preview.destructiveActions.blocked).toEqual([]);
  });

  it('classifies live-only approvals as destructive deletes in recovery mode', () => {
    const preview = detectRestorePreviewConflicts(
      { schemaVersion: 1, tasks: [], approvals: [], memory: [], cron: [] },
      {
        schemaVersion: 1,
        tasks: [],
        approvals: [{ id: 'live-only-approval', state: 'pending', digest: 'live-token' }],
        memory: [],
        cron: [],
      },
      { recoveryMode: true },
    );

    expect(preview.conflicts).toContainEqual(
      expect.objectContaining({ area: 'approvals', id: 'live-only-approval', type: 'live-only' }),
    );
    expect(preview.destructiveActions.blocked).toContainEqual(
      expect.objectContaining({ area: 'approvals', id: 'live-only-approval', type: 'delete-live-record' }),
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
      formatVersion: 2,
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
        consistencyFindingCount: 0,
        consistencyBlockerCount: 0,
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
      consistency: {
        backup: expect.objectContaining({ status: 'clean', findings: [] }),
        live: expect.objectContaining({ status: 'clean', findings: [] }),
      },
      operatorGuidance: expect.stringContaining('do not execute restore'),
    });
    expect(JSON.stringify(report)).not.toContain('secret-token-value');
    expect(JSON.stringify(report)).not.toContain('pending-token');
  });

  it('reports a clean cross-file state consistency check when references resolve', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-1', digest: 'task-digest' }],
        approvals: [{ id: 'approval-1', state: 'approved', value: { taskId: 'task-1' } }],
        memory: [{ id: 'memory-1', value: { taskIds: ['task-1'] } }],
        cron: [{ id: 'cron-1', state: 'enabled', value: { taskId: 'task-1' } }],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report).toEqual({
      checkedAt: '2026-07-14T12:30:00.000Z',
      wouldWrite: false,
      status: 'clean',
      findings: [],
      operatorSummary: expect.stringContaining('clean'),
    });
  });

  it('blocks cross-file state manifests with dangling or malformed task references', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-live', digest: 'task-digest' }],
        approvals: [{ id: 'approval-orphan', state: 'approved', value: { taskId: 'task-missing', token: 'secret-token' } }],
        memory: [{ id: 'memory-bad', value: { taskIds: ['task-live', 42] } }],
        cron: [{ id: 'cron-bad', state: 'enabled', value: { taskId: { id: 'task-live' } } }],
      } as unknown as RestorePreviewManifest,
      { checkedAt: '2026-07-14T12:30:00.000Z', manifestPath: '/backups/dr/manifest.json' },
    );

    expect(report.status).toBe('blocked');
    expect(report.wouldWrite).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'dangling-task-reference',
          area: 'approvals',
          id: 'approval-orphan',
          filePath: '/backups/dr/manifest.json',
          jsonPath: '$.approvals[0].value.taskId',
          severity: 'blocker',
        }),
        expect.objectContaining({
          code: 'malformed-task-reference',
          area: 'memory',
          id: 'memory-bad',
          referenceField: 'taskIds',
          jsonPath: '$.memory[0].value.taskIds[1]',
          severity: 'blocker',
        }),
        expect.objectContaining({
          code: 'malformed-task-reference',
          area: 'cron',
          id: 'cron-bad',
          referenceField: 'taskId',
          jsonPath: '$.cron[0].value.taskId',
          severity: 'blocker',
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toContain('secret-token');
  });

  it('keeps task-reference finding ids machine-readable when the owning record id is invalid', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-live', digest: 'task-digest' }],
        approvals: [{ state: 'approved', value: { taskId: { id: 'task-live' } } }],
        memory: [{ id: 42, value: { taskIds: ['task-missing'] } }],
        cron: [],
      } as unknown as RestorePreviewManifest,
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'malformed-record-id',
          area: 'approvals',
          id: '<missing>',
          jsonPath: '$.approvals[0].id',
        }),
        expect.objectContaining({
          code: 'malformed-task-reference',
          area: 'approvals',
          id: '<missing>',
          jsonPath: '$.approvals[0].value.taskId',
          message: expect.stringContaining("Record '<missing>'"),
        }),
        expect.objectContaining({
          code: 'malformed-record-id',
          area: 'memory',
          id: '<missing>',
          jsonPath: '$.memory[0].id',
        }),
        expect.objectContaining({
          code: 'dangling-task-reference',
          area: 'memory',
          id: '<missing>',
          jsonPath: '$.memory[0].value.taskIds[0]',
          message: expect.stringContaining("Record '<missing>'"),
        }),
      ]),
    );
    expect(report.findings.every((finding) => typeof finding.id === 'string' && finding.id.length > 0)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('undefined');
  });

  it('includes cross-file consistency findings in restore dry-run JSON', () => {
    const report = buildRestoreDryRunReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-1', digest: 'task-digest' }],
        approvals: [{ id: 'approval-orphan', value: { taskId: 'task-missing' } }],
        memory: [],
        cron: [],
      },
      { schemaVersion: 1, tasks: [{ id: 'task-1', digest: 'task-digest' }], approvals: [], memory: [], cron: [] },
      { generatedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.summary.consistencyFindingCount).toBe(1);
    expect(report.summary.consistencyBlockerCount).toBe(1);
    expect(report.summary.safeToRestore).toBe(false);
    expect(report.consistency.backup.checkedAt).toBe(report.generatedAt);
    expect(report.consistency.live.checkedAt).toBe(report.generatedAt);
    expect(report.consistency.backup.findings).toContainEqual(
      expect.objectContaining({ code: 'dangling-task-reference' }),
    );
    expect(report.operatorGuidance).toContain('cross-file consistency findings');
  });

  it('marks otherwise matching manifests unsafe when cross-file consistency is blocked', () => {
    const manifest: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'task-1', digest: 'task-digest' }],
      approvals: [{ id: 'approval-orphan', value: { taskId: 'missing-task' } }],
      memory: [],
      cron: [],
    };

    const report = buildRestoreDryRunReport(clone(manifest), clone(manifest), {
      generatedAt: '2026-07-14T12:30:00.000Z',
    });

    expect(report.preview.safeToRestore).toBe(true);
    expect(report.summary.conflictCount).toBe(0);
    expect(report.summary.consistencyBlockerCount).toBe(2);
    expect(report.summary.safeToRestore).toBe(false);
    expect(report.operatorGuidance).toContain('cross-file consistency findings');
  });

  it('marks otherwise matching manifests unsafe when cross-file consistency has warnings', () => {
    const manifest: RestorePreviewManifest = {
      schemaVersion: 1,
      tasks: [{ id: 'shared-id', digest: 'task-digest' }],
      approvals: [{ id: 'shared-id', state: 'pending' }],
      memory: [],
      cron: [],
    };

    const report = buildRestoreDryRunReport(clone(manifest), clone(manifest), {
      generatedAt: '2026-07-14T12:30:00.000Z',
    });

    expect(report.preview.safeToRestore).toBe(true);
    expect(report.summary.conflictCount).toBe(0);
    expect(report.summary.consistencyFindingCount).toBe(4);
    expect(report.summary.consistencyBlockerCount).toBe(0);
    expect(report.summary.safeToRestore).toBe(false);
  });

  it('does not leak unverified dangling task reference values', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-live', digest: 'task-digest' }],
        approvals: [{ id: 'approval-orphan', value: { taskId: 'secret-token-value' } }],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'dangling-task-reference',
        area: 'approvals',
        id: 'approval-orphan',
        referenceField: 'taskId',
      }),
    );
    expect(JSON.stringify(report)).not.toContain('secret-token-value');
  });

  it('ignores arbitrary value.tasks payloads that are not explicit task-reference fields', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-live', digest: 'task-digest' }],
        approvals: [],
        memory: [{ id: 'memory-planner-output', value: { tasks: [{ id: 'domain-task' }] } }],
        cron: [{ id: 'cron-empty-domain-list', value: { tasks: [] } }],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('clean');
    expect(report.findings).toEqual([]);
  });

  it('ignores arbitrary value.task payloads that are not explicit task-reference fields', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-live', digest: 'task-digest' }],
        approvals: [],
        memory: [{ id: 'memory-note', value: { task: 'fix auth flow' } }],
        cron: [{ id: 'cron-domain-note', value: { task: { title: 'domain task, not a card id' } } }],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('clean');
    expect(report.findings).toEqual([]);
  });

  it('allows empty explicit task reference arrays as no references', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'task-live', digest: 'task-digest' }],
        approvals: [],
        memory: [{ id: 'memory-empty-links', value: { taskIds: [] } }],
        cron: [{ id: 'cron-empty-links', value: { task_ids: [] } }],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('clean');
    expect(report.findings).toEqual([]);
  });

  it('does not report dangling task references when the tasks snapshot is omitted', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        approvals: [{ id: 'approval-partial', value: { taskId: 'task-not-captured' } }],
        memory: [{ id: 'memory-partial', value: { taskIds: ['task-not-captured'] } }],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('clean');
    expect(report.findings).toEqual([]);
  });

  it('warns when a record id is reused across state files', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 1,
        tasks: [{ id: 'shared-id', digest: 'task-digest' }],
        approvals: [{ id: 'shared-id', state: 'pending' }],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z' },
    );

    expect(report.status).toBe('warning');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-record-id-across-areas', area: 'approvals', relatedAreas: ['tasks'] }),
        expect.objectContaining({ code: 'duplicate-record-id-across-areas', area: 'tasks', relatedAreas: ['approvals'] }),
      ]),
    );
  });

  it('blocks malformed schema versions and inconsistent record identifiers with path context', () => {
    const report = buildCrossFileStateConsistencyReport(
      {
        schemaVersion: 2,
        tasks: [
          { id: '', digest: 'missing-id' },
          { id: 'task-duplicate', digest: 'first' },
          { id: 'task-duplicate', digest: 'second' },
        ],
        approvals: [{ id: 'approval-1', value: { taskId: 'task-duplicate' } }],
        memory: [],
        cron: [],
      },
      { checkedAt: '2026-07-14T12:30:00.000Z', manifestPath: '/backups/dr/manifest.json' },
    );

    expect(report.status).toBe('blocked');
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-schema-version',
          area: 'schema',
          id: 'schema-version',
          filePath: '/backups/dr/manifest.json',
          jsonPath: '$.schemaVersion',
          severity: 'blocker',
        }),
        expect.objectContaining({
          code: 'malformed-record-id',
          area: 'tasks',
          id: '<missing>',
          filePath: '/backups/dr/manifest.json',
          jsonPath: '$.tasks[0].id',
          severity: 'blocker',
        }),
        expect.objectContaining({
          code: 'duplicate-record-id-within-area',
          area: 'tasks',
          id: 'task-duplicate',
          filePath: '/backups/dr/manifest.json',
          jsonPath: '$.tasks[2].id',
          severity: 'blocker',
        }),
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
