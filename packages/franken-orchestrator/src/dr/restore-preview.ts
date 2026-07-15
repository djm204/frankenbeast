export type RestorePreviewArea = 'schema' | 'tasks' | 'approvals' | 'memory' | 'cron';

export type BackupEncryptionVerificationStatus = 'verified' | 'warning' | 'failed';

export type BackupEncryptionVerificationSeverity = 'info' | 'warning' | 'blocker';

export type BackupEncryptionVerificationFindingCode =
  | 'missing-encryption-metadata'
  | 'backup-not-encrypted'
  | 'missing-algorithm'
  | 'unsupported-algorithm'
  | 'missing-key-reference'
  | 'missing-artifact-digest';

export interface BackupEncryptionMetadata {
  readonly encrypted: boolean;
  readonly algorithm?: string;
  readonly keyRef?: string;
  readonly artifactDigest?: string;
  readonly generatedAt?: string;
}

export interface BackupEncryptionVerificationFinding {
  readonly code: BackupEncryptionVerificationFindingCode;
  readonly severity: BackupEncryptionVerificationSeverity;
  readonly message: string;
  readonly recommendation: string;
}

export interface BackupEncryptionVerificationReport {
  /** ISO timestamp for when the report was generated, supplied by callers for deterministic tests. */
  readonly checkedAt: string;
  readonly status: BackupEncryptionVerificationStatus;
  readonly encrypted: boolean;
  readonly metadata?: BackupEncryptionMetadata;
  readonly findings: readonly BackupEncryptionVerificationFinding[];
  readonly operatorSummary: string;
}

export interface BackupEncryptionVerificationOptions {
  readonly checkedAt?: string;
  readonly allowedAlgorithms?: readonly string[];
}

export type ApprovalLedgerRecoveryStatus = 'clean' | 'review-required' | 'blocked';

export type ApprovalLedgerRecoverySeverity = 'info' | 'warning' | 'blocker';

export type ApprovalLedgerRecoveryFindingCode =
  | 'schema-mismatch'
  | 'approval-backup-only'
  | 'approval-live-only'
  | 'approval-changed'
  | 'approval-newer-live';

export interface ApprovalLedgerRecordSummary {
  readonly state?: string;
  readonly digestPresent: boolean;
  readonly updatedAt?: string;
}

export interface ApprovalLedgerRecoveryFinding {
  readonly code: ApprovalLedgerRecoveryFindingCode;
  readonly approvalId: string;
  readonly severity: ApprovalLedgerRecoverySeverity;
  readonly message: string;
  readonly recommendation: string;
  readonly backup?: ApprovalLedgerRecordSummary;
  readonly live?: ApprovalLedgerRecordSummary;
}

export interface ApprovalLedgerRecoveryReport {
  /** ISO timestamp for when the report was generated, supplied by callers for deterministic tests. */
  readonly checkedAt: string;
  /** Explicitly records that approval-ledger recovery planning is read-only and performs no restore writes. */
  readonly wouldWrite: false;
  readonly status: ApprovalLedgerRecoveryStatus;
  readonly safeToApplyAutomatically: false;
  readonly findings: readonly ApprovalLedgerRecoveryFinding[];
  readonly operatorSummary: string;
}

export interface ApprovalLedgerRecoveryOptions {
  readonly checkedAt?: string;
}

export interface PointInTimeBackupManifestMetadata {
  /** Instant the backup logically represents. Restores should not assume state after this time is present. */
  readonly capturedAt: string;
  /** Instant this manifest was written, supplied by callers for deterministic tests and audit logs. */
  readonly generatedAt: string;
  /** Operator-readable source such as an environment, backup job id, or storage URI. */
  readonly source?: string;
  /** Restore-preview areas explicitly present in this point-in-time manifest. */
  readonly includedAreas: readonly ComparableArea[];
  /** Record counts for explicitly captured areas so omitted areas remain visible before restore. */
  readonly recordCounts: Readonly<Partial<Record<ComparableArea, number>>>;
  /** Optional digest for the manifest payload or archive that contains it. */
  readonly manifestDigest?: string;
}

export interface PointInTimeBackupManifest extends RestorePreviewManifest {
  readonly generatedAt: string;
  readonly pointInTime: PointInTimeBackupManifestMetadata;
}

export interface PointInTimeBackupManifestOptions {
  /** Instant the backup logically represents. Defaults to generatedAt when omitted. */
  readonly capturedAt?: string;
  /** Instant this manifest was generated. Defaults to the current wall-clock time. */
  readonly generatedAt?: string;
  readonly source?: string;
  readonly manifestDigest?: string;
}

export type RestorePreviewConflictType =
  | 'schema-mismatch'
  | 'changed'
  | 'newer-live'
  | 'backup-only'
  | 'live-only';

export type RestorePreviewSeverity = 'info' | 'warning' | 'blocker';

export type CrossFileStateConsistencyStatus = 'clean' | 'warning' | 'blocked';

export type CrossFileStateConsistencyFindingCode =
  | 'unsupported-schema-version'
  | 'malformed-record-id'
  | 'duplicate-record-id-within-area'
  | 'duplicate-record-id-across-areas'
  | 'dangling-task-reference'
  | 'malformed-task-reference';

export interface CrossFileStateConsistencyFinding {
  readonly code: CrossFileStateConsistencyFindingCode;
  readonly severity: RestorePreviewSeverity;
  readonly area: RestorePreviewArea;
  readonly id: string;
  readonly filePath?: string;
  readonly jsonPath: string;
  readonly message: string;
  readonly recommendation: string;
  readonly relatedAreas?: readonly ComparableArea[];
  readonly referenceField?: string;
  readonly referencedTaskId?: string;
}

export interface CrossFileStateConsistencyReport {
  /** ISO timestamp for when the report was generated, supplied by callers for deterministic tests. */
  readonly checkedAt: string;
  /** Explicitly records that consistency checking is read-only and performs no restore writes. */
  readonly wouldWrite: false;
  readonly status: CrossFileStateConsistencyStatus;
  readonly findings: readonly CrossFileStateConsistencyFinding[];
  readonly operatorSummary: string;
}

export interface CrossFileStateConsistencyOptions {
  readonly checkedAt?: string;
  readonly manifestPath?: string;
}

export type RestorePreviewMode = 'normal' | 'recovery';

export type RestorePreviewDestructiveActionType =
  | 'schema-migration'
  | 'overwrite-live-record'
  | 'delete-live-record'
  | 'restore-approval-token';

export interface RestorePreviewRecord {
  readonly id: string;
  readonly digest?: string;
  readonly state?: string;
  readonly updatedAt?: string;
  readonly value?: unknown;
}

export interface RestorePreviewManifest {
  readonly schemaVersion: number;
  readonly generatedAt?: string;
  readonly pointInTime?: PointInTimeBackupManifestMetadata;
  readonly encryption?: BackupEncryptionMetadata;
  readonly tasks?: readonly RestorePreviewRecord[];
  readonly approvals?: readonly RestorePreviewRecord[];
  readonly memory?: readonly RestorePreviewRecord[];
  readonly cron?: readonly RestorePreviewRecord[];
}

export interface RestorePreviewConflict {
  readonly area: RestorePreviewArea;
  readonly id: string;
  readonly type: RestorePreviewConflictType;
  readonly severity: RestorePreviewSeverity;
  readonly backup?: RestorePreviewRecord | { readonly schemaVersion: number };
  readonly live?: RestorePreviewRecord | { readonly schemaVersion: number };
  readonly recommendation: string;
}

export interface RestorePreviewOptions {
  /**
   * Recovery mode keeps restore planning read-only and disables every action that would
   * overwrite, delete, migrate, or re-authorize live state.
   */
  readonly recoveryMode?: boolean;
}

export interface RestorePreviewDestructiveAction {
  readonly area: RestorePreviewArea;
  readonly id: string;
  readonly type: RestorePreviewDestructiveActionType;
  readonly reason: string;
}

export interface RestorePreviewDestructiveActionPolicy {
  /** False in recovery mode so automation can hard-stop before any mutating restore step. */
  readonly enabled: boolean;
  readonly blocked: readonly RestorePreviewDestructiveAction[];
  readonly guidance: string;
}

export interface RestorePreviewResult {
  /** Explicitly records that preview calculation is read-only and performs no restore writes. */
  readonly wouldWrite: false;
  readonly mode: RestorePreviewMode;
  readonly safeToRestore: boolean;
  readonly schema: {
    readonly backupVersion: number;
    readonly liveVersion: number;
    readonly compatible: boolean;
  };
  readonly destructiveActions: RestorePreviewDestructiveActionPolicy;
  readonly conflicts: readonly RestorePreviewConflict[];
}

export interface RestoreDryRunReportOptions {
  /** ISO timestamp for deterministic automation/tests; defaults to the current time. */
  readonly generatedAt?: string;
  readonly backupPath?: string;
  readonly livePath?: string;
}

export interface RestoreDryRunConflictRecordSummary {
  readonly id: string;
  readonly state?: string;
  readonly digestPresent?: boolean;
  readonly valuePresent?: boolean;
  readonly updatedAt?: string;
}

export interface RestoreDryRunConflict {
  readonly area: RestorePreviewArea;
  readonly id: string;
  readonly type: RestorePreviewConflictType;
  readonly severity: RestorePreviewSeverity;
  readonly backup?: RestorePreviewRecord | RestoreDryRunConflictRecordSummary | { readonly schemaVersion: number };
  readonly live?: RestorePreviewRecord | RestoreDryRunConflictRecordSummary | { readonly schemaVersion: number };
  readonly recommendation: string;
}

export interface RestoreDryRunPreviewResult {
  readonly wouldWrite: false;
  readonly safeToRestore: boolean;
  readonly schema: RestorePreviewResult['schema'];
  readonly conflicts: readonly RestoreDryRunConflict[];
}

export interface RestoreDryRunReport {
  readonly ok: true;
  readonly command: 'dr restore-dry-run';
  readonly formatVersion: 2;
  readonly generatedAt: string;
  readonly dryRun: true;
  readonly wouldWrite: false;
  readonly inputs: {
    readonly backupPath?: string;
    readonly livePath?: string;
  };
  readonly summary: {
    readonly safeToRestore: boolean;
    readonly conflictCount: number;
    readonly blockerCount: number;
    readonly warningCount: number;
    readonly infoCount: number;
    readonly consistencyFindingCount: number;
    readonly consistencyBlockerCount: number;
  };
  readonly preview: RestoreDryRunPreviewResult;
  readonly consistency: {
    readonly backup: CrossFileStateConsistencyReport;
    readonly live: CrossFileStateConsistencyReport;
  };
  readonly operatorGuidance: string;
}

type ComparableArea = Exclude<RestorePreviewArea, 'schema'>;

const AREA_ACCESSORS = {
  tasks: (manifest: RestorePreviewManifest) => manifest.tasks ?? [],
  approvals: (manifest: RestorePreviewManifest) => manifest.approvals ?? [],
  memory: (manifest: RestorePreviewManifest) => manifest.memory ?? [],
  cron: (manifest: RestorePreviewManifest) => manifest.cron ?? [],
} satisfies Record<ComparableArea, (manifest: RestorePreviewManifest) => readonly RestorePreviewRecord[]>;

const DEFAULT_ALLOWED_BACKUP_ENCRYPTION_ALGORITHMS = ['aes-256-gcm', 'xchacha20-poly1305'] as const;
const SUPPORTED_RESTORE_SCHEMA_VERSION = 1;

export function buildPointInTimeBackupManifest(
  manifest: RestorePreviewManifest,
  options: PointInTimeBackupManifestOptions = {},
): PointInTimeBackupManifest {
  const generatedAt = normalizeIsoInstant(options.generatedAt ?? new Date().toISOString(), 'generatedAt');
  const capturedAt = normalizeIsoInstant(options.capturedAt ?? generatedAt, 'capturedAt');

  if (Date.parse(capturedAt) > Date.parse(generatedAt)) {
    throw new Error('Point-in-time backup manifest capturedAt must not be later than generatedAt.');
  }

  const capturedAreas = (Object.keys(AREA_ACCESSORS) as ComparableArea[]).filter(
    (area) => manifest[area] !== undefined,
  );
  const recordCounts = Object.fromEntries(
    capturedAreas.map((area) => [area, AREA_ACCESSORS[area](manifest).length]),
  ) as Partial<Record<ComparableArea, number>>;
  const pointInTime: PointInTimeBackupManifestMetadata = {
    capturedAt,
    generatedAt,
    ...(options.source === undefined ? {} : { source: options.source }),
    includedAreas: capturedAreas,
    recordCounts,
    ...(options.manifestDigest === undefined ? {} : { manifestDigest: options.manifestDigest }),
  };

  return {
    schemaVersion: manifest.schemaVersion,
    generatedAt,
    pointInTime,
    ...(manifest.encryption === undefined ? {} : { encryption: { ...manifest.encryption } }),
    ...copyCapturedRecords(manifest),
  };
}

export function buildBackupEncryptionVerificationReport(
  manifest: RestorePreviewManifest,
  options: BackupEncryptionVerificationOptions = {},
): BackupEncryptionVerificationReport {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const encryption = isRecord(manifest.encryption)
    ? (manifest.encryption as unknown as BackupEncryptionMetadata)
    : undefined;
  const findings: BackupEncryptionVerificationFinding[] = [];
  const allowedAlgorithms = new Set(
    (options.allowedAlgorithms ?? DEFAULT_ALLOWED_BACKUP_ENCRYPTION_ALGORITHMS).map((algorithm) =>
      algorithm.toLowerCase(),
    ),
  );

  if (encryption === undefined) {
    findings.push({
      code: 'missing-encryption-metadata',
      severity: 'blocker',
      message: 'Backup manifest does not include encryption metadata.',
      recommendation:
        'Do not restore or archive this backup as verified; regenerate it with encryption metadata before proceeding.',
    });
  } else {
    if (encryption.encrypted !== true) {
      findings.push({
        code: 'backup-not-encrypted',
        severity: 'blocker',
        message: 'Backup manifest does not explicitly report that the backup artifact is encrypted.',
        recommendation: 'Regenerate the backup with encryption enabled before using it for disaster recovery.',
      });
    }

    const algorithm = optionalString(encryption.algorithm)?.trim();
    if (algorithm === undefined || algorithm.length === 0) {
      findings.push({
        code: 'missing-algorithm',
        severity: 'blocker',
        message: 'Backup encryption metadata is missing the encryption algorithm.',
        recommendation: 'Record the cipher suite used for the backup so operators can verify it before restore.',
      });
    } else if (!allowedAlgorithms.has(algorithm.toLowerCase())) {
      findings.push({
        code: 'unsupported-algorithm',
        severity: 'warning',
        message: `Backup encryption algorithm ${algorithm} is not in the allowed algorithm list.`,
        recommendation: `Use one of: ${[...allowedAlgorithms].sort().join(', ')}; otherwise require an explicit operator exception.`,
      });
    }

    const keyRef = optionalString(encryption.keyRef)?.trim();
    if (keyRef === undefined || keyRef.length === 0) {
      findings.push({
        code: 'missing-key-reference',
        severity: 'warning',
        message: 'Backup encryption metadata is missing the logical key reference.',
        recommendation: 'Record the logical key reference so restore operators can locate the correct decrypt key.',
      });
    }

    const artifactDigest = optionalString(encryption.artifactDigest)?.trim();
    if (artifactDigest === undefined || artifactDigest.length === 0) {
      findings.push({
        code: 'missing-artifact-digest',
        severity: 'warning',
        message: 'Backup encryption metadata is missing the encrypted artifact digest.',
        recommendation: 'Record the encrypted artifact digest so operators can detect tampering or partial backups.',
      });
    }
  }

  const status = statusForEncryptionFindings(findings);

  return {
    checkedAt,
    status,
    encrypted: encryption?.encrypted === true,
    ...(encryption === undefined ? {} : { metadata: { ...encryption } }),
    findings,
    operatorSummary: operatorSummaryForEncryptionReport(status, findings.length),
  };
}

export function buildApprovalLedgerRecoveryReport(
  backup: RestorePreviewManifest,
  live: RestorePreviewManifest,
  options: ApprovalLedgerRecoveryOptions = {},
): ApprovalLedgerRecoveryReport {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const preview = detectRestorePreviewConflicts(backup, live);
  const findings: ApprovalLedgerRecoveryFinding[] = [];

  if (!preview.schema.compatible) {
    findings.push({
      code: 'schema-mismatch',
      approvalId: 'schema-version',
      severity: 'blocker',
      message: `Backup schema version ${preview.schema.backupVersion} does not match live schema version ${preview.schema.liveVersion}.`,
      recommendation:
        'Do not recover approval ledger entries until the backup has been migrated to the live schema version or the restore is run against a compatible live store.',
    });
  }

  for (const conflict of preview.conflicts) {
    if (conflict.area !== 'approvals') continue;
    findings.push(findingForApprovalConflict(conflict));
  }

  const status = statusForApprovalLedgerFindings(findings);

  return {
    checkedAt,
    wouldWrite: false,
    status,
    safeToApplyAutomatically: false,
    findings,
    operatorSummary: operatorSummaryForApprovalLedgerReport(status, findings.length),
  };
}

export function detectRestorePreviewConflicts(
  backup: RestorePreviewManifest,
  live: RestorePreviewManifest,
  options: RestorePreviewOptions = {},
): RestorePreviewResult {
  const conflicts: RestorePreviewConflict[] = [];
  const schemaCompatible = backup.schemaVersion === live.schemaVersion;
  const mode: RestorePreviewMode = options.recoveryMode === true ? 'recovery' : 'normal';

  if (!schemaCompatible) {
    conflicts.push({
      area: 'schema',
      id: 'schema-version',
      type: 'schema-mismatch',
      severity: 'blocker',
      backup: { schemaVersion: backup.schemaVersion },
      live: { schemaVersion: live.schemaVersion },
      recommendation:
        'Do not restore blindly; run a schema migration or use a backup produced by the live schema version before restoring.',
    });
  }

  for (const area of Object.keys(AREA_ACCESSORS) as ComparableArea[]) {
    conflicts.push(...compareRecords(area, AREA_ACCESSORS[area](backup), AREA_ACCESSORS[area](live)));
  }

  return {
    wouldWrite: false,
    mode,
    safeToRestore: conflicts.length === 0,
    schema: {
      backupVersion: backup.schemaVersion,
      liveVersion: live.schemaVersion,
      compatible: schemaCompatible,
    },
    destructiveActions: buildDestructiveActionPolicy(conflicts, mode),
    conflicts,
  };
}

export function buildCrossFileStateConsistencyReport(
  manifest: RestorePreviewManifest,
  options: CrossFileStateConsistencyOptions = {},
): CrossFileStateConsistencyReport {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const findingContext = options.manifestPath === undefined ? {} : { filePath: options.manifestPath };
  const findings: CrossFileStateConsistencyFinding[] = [];
  const hasTaskSnapshot = manifest.tasks !== undefined;
  const taskIds = new Set(
    AREA_ACCESSORS.tasks(manifest)
      .map((record) => record.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );
  const areasById = new Map<string, Set<ComparableArea>>();

  if (manifest.schemaVersion !== SUPPORTED_RESTORE_SCHEMA_VERSION) {
    findings.push({
      code: 'unsupported-schema-version',
      severity: 'blocker',
      area: 'schema',
      id: 'schema-version',
      ...findingContext,
      jsonPath: '$.schemaVersion',
      message: `Manifest schema version ${String(manifest.schemaVersion)} is not supported by this restore checker.`,
      recommendation:
        'Do not restore this manifest until it has been migrated to the supported restore schema version or the checker has explicit compatibility support for that version.',
    });
  }

  for (const area of Object.keys(AREA_ACCESSORS) as ComparableArea[]) {
    const idsInArea = new Map<string, number>();
    AREA_ACCESSORS[area](manifest).forEach((record, index) => {
      if (typeof record.id !== 'string' || record.id.trim().length === 0) {
        findings.push({
          code: 'malformed-record-id',
          severity: 'blocker',
          area,
          id: '<missing>',
          ...findingContext,
          jsonPath: areaRecordJsonPath(area, index, 'id'),
          message: `Record at ${area}[${index}] is missing a non-empty string id.`,
          recommendation:
            'Repair the manifest record id before restore so cross-file references can be checked deterministically.',
        });
        return;
      }

      const firstIndex = idsInArea.get(record.id);
      if (firstIndex !== undefined) {
        findings.push({
          code: 'duplicate-record-id-within-area',
          severity: 'blocker',
          area,
          id: record.id,
          ...findingContext,
          jsonPath: areaRecordJsonPath(area, index, 'id'),
          message: `Record id '${record.id}' appears more than once in ${area}.`,
          recommendation:
            'Deduplicate or rename repeated records before restore; otherwise the restore plan cannot determine which record owns dependent state.',
        });
      } else {
        idsInArea.set(record.id, index);
      }

      const areas = areasById.get(record.id) ?? new Set<ComparableArea>();
      areas.add(area);
      areasById.set(record.id, areas);
    });
  }

  for (const [id, areas] of [...areasById.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (areas.size <= 1) continue;
    const sortedAreas = [...areas].sort();
    for (const area of sortedAreas) {
      const recordIndex = AREA_ACCESSORS[area](manifest).findIndex((record) => record.id === id);
      findings.push({
        code: 'duplicate-record-id-across-areas',
        severity: 'warning',
        area,
        id,
        ...findingContext,
        jsonPath: areaRecordJsonPath(area, recordIndex, 'id'),
        relatedAreas: sortedAreas.filter((candidate) => candidate !== area),
        message: `Record id '${id}' appears in multiple manifest areas: ${sortedAreas.join(', ')}.`,
        recommendation:
          'Confirm these cross-file records intentionally describe different state objects or rename/package them so restore operators can distinguish them.',
      });
    }
  }

  for (const area of ['approvals', 'memory', 'cron'] as const) {
    AREA_ACCESSORS[area](manifest).forEach((record, index) => {
      for (const reference of taskReferencesFor(record, area, index)) {
        if (reference.malformed) {
          findings.push({
            code: 'malformed-task-reference',
            severity: 'blocker',
            area,
            id: record.id,
            ...findingContext,
            jsonPath: reference.jsonPath,
            referenceField: reference.field,
            message: `Record '${record.id}' in ${area} has a malformed task reference in value.${reference.field}.`,
            recommendation:
              'Quarantine or repair this state record before restore so automation does not guess which task/card the cross-file record belongs to.',
          });
          continue;
        }

        if (hasTaskSnapshot && reference.taskId !== undefined && !taskIds.has(reference.taskId)) {
          findings.push({
            code: 'dangling-task-reference',
            severity: 'blocker',
            area,
            id: record.id,
            ...findingContext,
            jsonPath: reference.jsonPath,
            referenceField: reference.field,
            message: `Record '${record.id}' in ${area} references a task that is missing from the manifest.`,
            recommendation:
              'Do not restore this manifest blindly. Restore, recreate, or explicitly skip the referenced task/card before applying dependent approval, memory, or cron state.',
          });
        }
      }
    });
  }

  const status = statusForConsistencyFindings(findings);
  return {
    checkedAt,
    wouldWrite: false,
    status,
    findings,
    operatorSummary: operatorSummaryForConsistencyReport(status, findings.length),
  };
}

export function buildRestoreDryRunReport(
  backup: RestorePreviewManifest,
  live: RestorePreviewManifest,
  options: RestoreDryRunReportOptions = {},
): RestoreDryRunReport {
  const preview = detectRestorePreviewConflicts(backup, live);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const backupConsistency = buildCrossFileStateConsistencyReport(backup, {
    checkedAt: generatedAt,
    ...(options.backupPath === undefined ? {} : { manifestPath: options.backupPath }),
  });
  const liveConsistency = buildCrossFileStateConsistencyReport(live, {
    checkedAt: generatedAt,
    ...(options.livePath === undefined ? {} : { manifestPath: options.livePath }),
  });
  const blockerCount = preview.conflicts.filter((conflict) => conflict.severity === 'blocker').length;
  const warningCount = preview.conflicts.filter((conflict) => conflict.severity === 'warning').length;
  const infoCount = preview.conflicts.filter((conflict) => conflict.severity === 'info').length;
  const consistencyFindingCount = backupConsistency.findings.length + liveConsistency.findings.length;
  const consistencyBlockerCount = [...backupConsistency.findings, ...liveConsistency.findings].filter(
    (finding) => finding.severity === 'blocker',
  ).length;
  const safeToRestore = preview.safeToRestore && consistencyFindingCount === 0;

  return {
    ok: true,
    command: 'dr restore-dry-run',
    formatVersion: 2,
    generatedAt,
    dryRun: true,
    wouldWrite: false,
    inputs: {
      ...(options.backupPath === undefined ? {} : { backupPath: options.backupPath }),
      ...(options.livePath === undefined ? {} : { livePath: options.livePath }),
    },
    summary: {
      safeToRestore,
      conflictCount: preview.conflicts.length,
      blockerCount,
      warningCount,
      infoCount,
      consistencyFindingCount,
      consistencyBlockerCount,
    },
    preview: redactPreviewForDryRun(preview),
    consistency: {
      backup: backupConsistency,
      live: liveConsistency,
    },
    operatorGuidance: safeToRestore
      ? 'Dry-run only: no restore writes were performed. Review the JSON report, then execute restore separately if an operator explicitly approves it.'
      : 'Dry-run only: no restore writes were performed; do not execute restore until blocker/warning conflicts and cross-file consistency findings have explicit restore, merge, skip, repair, or quarantine decisions.',
  };
}

function redactPreviewForDryRun(preview: RestorePreviewResult): RestoreDryRunPreviewResult {
  return {
    ...preview,
    conflicts: preview.conflicts.map((conflict) => ({
      ...conflict,
      ...(conflict.backup === undefined ? {} : { backup: redactConflictRecord(conflict.backup) }),
      ...(conflict.live === undefined ? {} : { live: redactConflictRecord(conflict.live) }),
    })),
  };
}

function redactConflictRecord(
  record: RestorePreviewRecord | { readonly schemaVersion: number },
): RestoreDryRunConflictRecordSummary | { readonly schemaVersion: number } {
  if (!('id' in record)) return record;
  return {
    id: record.id,
    ...(typeof record.state === 'string' ? { state: record.state } : {}),
    ...(typeof record.digest === 'string' ? { digestPresent: true } : {}),
    ...('value' in record && record.value !== undefined ? { valuePresent: true } : {}),
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
  };
}

function statusForEncryptionFindings(
  findings: readonly BackupEncryptionVerificationFinding[],
): BackupEncryptionVerificationStatus {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'failed';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning';
  return 'verified';
}

function findingForApprovalConflict(conflict: RestorePreviewConflict): ApprovalLedgerRecoveryFinding {
  const backup = summarizeApprovalRecord(conflict.backup);
  const live = summarizeApprovalRecord(conflict.live);

  switch (conflict.type) {
    case 'backup-only':
      return {
        code: 'approval-backup-only',
        approvalId: conflict.id,
        severity: 'blocker',
        message: 'Backup contains an approval ledger entry that is absent from live state.',
        recommendation:
          'Quarantine this backup approval entry and require a fresh human re-approval before any action can reuse the approval.',
        ...(backup === undefined ? {} : { backup }),
      };
    case 'live-only':
      return {
        code: 'approval-live-only',
        approvalId: conflict.id,
        severity: 'warning',
        message: 'Live state contains an approval ledger entry that is absent from the backup.',
        recommendation:
          'Preserve the live approval ledger entry during recovery unless an operator explicitly expires it; do not let the backup delete live approval evidence silently.',
        ...(live === undefined ? {} : { live }),
      };
    case 'newer-live':
      return {
        code: 'approval-newer-live',
        approvalId: conflict.id,
        severity: 'blocker',
        message: 'Live approval ledger state is newer than the backup copy.',
        recommendation:
          'Preserve the live approval state and require fresh re-approval for any action whose approval evidence differs from the backup.',
        ...(backup === undefined ? {} : { backup }),
        ...(live === undefined ? {} : { live }),
      };
    case 'changed':
    default:
      return {
        code: 'approval-changed',
        approvalId: conflict.id,
        severity: 'blocker',
        message: 'Backup and live approval ledger entries differ.',
        recommendation:
          'Do not merge or replay this approval token automatically; require fresh re-approval and keep both ledger snapshots for audit review.',
        ...(backup === undefined ? {} : { backup }),
        ...(live === undefined ? {} : { live }),
      };
  }
}

function summarizeApprovalRecord(
  record: RestorePreviewConflict['backup'] | RestorePreviewConflict['live'],
): ApprovalLedgerRecordSummary | undefined {
  if (!isRecord(record) || 'schemaVersion' in record) return undefined;
  const summarySource = record as Record<string, unknown>;
  return {
    ...(typeof summarySource.state === 'string' ? { state: summarySource.state } : {}),
    digestPresent: typeof summarySource.digest === 'string' && summarySource.digest.length > 0,
    ...(typeof summarySource.updatedAt === 'string' ? { updatedAt: summarySource.updatedAt } : {}),
  };
}

function statusForApprovalLedgerFindings(
  findings: readonly ApprovalLedgerRecoveryFinding[],
): ApprovalLedgerRecoveryStatus {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'blocked';
  if (findings.length > 0) return 'review-required';
  return 'clean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeIsoInstant(value: string, fieldName: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`Point-in-time backup manifest ${fieldName} must be a valid canonical ISO timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function copyCapturedRecords(manifest: RestorePreviewManifest): Partial<Record<ComparableArea, readonly RestorePreviewRecord[]>> {
  return Object.fromEntries(
    (Object.keys(AREA_ACCESSORS) as ComparableArea[])
      .filter((area) => manifest[area] !== undefined)
      .map((area) => [area, cloneRecords(manifest[area])]),
  ) as Partial<Record<ComparableArea, readonly RestorePreviewRecord[]>>;
}

function cloneRecords(records: readonly RestorePreviewRecord[] | undefined): readonly RestorePreviewRecord[] {
  return (records ?? []).map((record) => ({
    ...record,
    ...(record.value === undefined ? {} : { value: cloneJsonValue(record.value) }),
  }));
}

function cloneJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item));
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, cloneJsonValue(item)]));
}

function operatorSummaryForEncryptionReport(
  status: BackupEncryptionVerificationStatus,
  findingCount: number,
): string {
  if (status === 'verified') return 'Backup encryption is verified; no encryption blockers or warnings were found.';
  if (status === 'warning') return `Backup encryption is present but has ${findingCount} warning(s) requiring operator review.`;
  return `Backup encryption verification failed with ${findingCount} blocker/warning finding(s); do not restore blindly.`;
}

function buildDestructiveActionPolicy(
  conflicts: readonly RestorePreviewConflict[],
  mode: RestorePreviewMode,
): RestorePreviewDestructiveActionPolicy {
  const blocked = mode === 'recovery' ? conflicts.flatMap(destructiveActionsForConflict) : [];
  return {
    enabled: mode !== 'recovery',
    blocked,
    guidance:
      mode === 'recovery'
        ? 'Recovery mode is active: destructive restore actions are disabled. Review conflicts, restore only non-destructive data, and require explicit operator approval before overwriting, deleting, migrating, or re-authorizing live state.'
        : 'Normal mode: preview remains read-only; downstream restore tooling must still require explicit operator approval before executing destructive actions.',
  };
}

function destructiveActionsForConflict(conflict: RestorePreviewConflict): RestorePreviewDestructiveAction[] {
  if (conflict.area === 'schema') {
    return [
      {
        area: conflict.area,
        id: conflict.id,
        type: 'schema-migration',
        reason: 'Schema mismatches can require live-state migrations before restore.',
      },
    ];
  }

  if (conflict.type === 'live-only') {
    return [
      {
        area: conflict.area,
        id: conflict.id,
        type: 'delete-live-record',
        reason: 'Removing live-only state would delete data that is absent from the backup.',
      },
    ];
  }

  if (conflict.type === 'backup-only' && conflict.area !== 'approvals') {
    return [];
  }

  if (conflict.area === 'approvals') {
    return [
      {
        area: conflict.area,
        id: conflict.id,
        type: 'restore-approval-token',
        reason: 'Approval tokens must not be restored or re-authorized during recovery mode.',
      },
    ];
  }

  return [
    {
      area: conflict.area,
      id: conflict.id,
      type: 'overwrite-live-record',
      reason: 'Applying the backup record would overwrite or replace current live state.',
    },
  ];
}

function operatorSummaryForApprovalLedgerReport(
  status: ApprovalLedgerRecoveryStatus,
  findingCount: number,
): string {
  if (status === 'clean') return 'Approval ledger recovery check is clean; no approval ledger drift was found.';
  if (status === 'review-required') return `Approval ledger recovery found ${findingCount} warning(s); preserve live approval evidence unless an operator explicitly expires it.`;
  return `Approval ledger recovery is blocked by ${findingCount} finding(s); stale or changed approvals require fresh human re-approval before restore.`;
}

interface TaskReferenceCandidate {
  readonly field: string;
  readonly jsonPath: string;
  readonly taskId?: string;
  readonly malformed?: boolean;
}

function taskReferencesFor(
  record: RestorePreviewRecord,
  area: ComparableArea,
  recordIndex: number,
): readonly TaskReferenceCandidate[] {
  if (!isRecord(record.value)) return [];
  const value = record.value;
  const references: TaskReferenceCandidate[] = [];
  for (const field of ['taskId', 'task_id'] as const) {
    if (!(field in value)) continue;
    const fieldValue = value[field];
    const jsonPath = areaRecordJsonPath(area, recordIndex, `value.${field}`);
    if (typeof fieldValue === 'string' && fieldValue.trim().length > 0) {
      references.push({ field, jsonPath, taskId: fieldValue });
    } else {
      references.push({ field, jsonPath, malformed: true });
    }
  }
  for (const field of ['taskIds', 'task_ids'] as const) {
    if (!(field in value)) continue;
    const fieldValue = value[field];
    if (!Array.isArray(fieldValue)) {
      references.push({ field, jsonPath: areaRecordJsonPath(area, recordIndex, `value.${field}`), malformed: true });
      continue;
    }
    fieldValue.forEach((item, itemIndex) => {
      const jsonPath = areaRecordJsonPath(area, recordIndex, `value.${field}[${itemIndex}]`);
      if (typeof item === 'string' && item.trim().length > 0) {
        references.push({ field, jsonPath, taskId: item });
      } else {
        references.push({ field, jsonPath, malformed: true });
      }
    });
  }
  return references;
}

function areaRecordJsonPath(area: ComparableArea, recordIndex: number, suffix: string): string {
  const normalizedIndex = recordIndex >= 0 ? recordIndex : 0;
  return `$.${area}[${normalizedIndex}].${suffix}`;
}

function statusForConsistencyFindings(
  findings: readonly CrossFileStateConsistencyFinding[],
): CrossFileStateConsistencyStatus {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'blocked';
  if (findings.length > 0) return 'warning';
  return 'clean';
}

function operatorSummaryForConsistencyReport(
  status: CrossFileStateConsistencyStatus,
  findingCount: number,
): string {
  if (status === 'clean') return 'Cross-file state consistency check is clean; no duplicate IDs or dangling task references were found.';
  if (status === 'warning') return `Cross-file state consistency found ${findingCount} warning(s); review duplicate record IDs before restore.`;
  return `Cross-file state consistency is blocked by ${findingCount} finding(s); repair or quarantine dangling/malformed task references before restore.`;
}

function compareRecords(
  area: ComparableArea,
  backupRecords: readonly RestorePreviewRecord[],
  liveRecords: readonly RestorePreviewRecord[],
): RestorePreviewConflict[] {
  const conflicts: RestorePreviewConflict[] = [];
  const backupById = indexById(backupRecords);
  const liveById = indexById(liveRecords);
  const ids = new Set([...backupById.keys(), ...liveById.keys()]);

  for (const id of [...ids].sort()) {
    const backup = backupById.get(id);
    const live = liveById.get(id);

    if (backup === undefined && live !== undefined) {
      conflicts.push({
        area,
        id,
        type: 'live-only',
        severity: area === 'approvals' ? 'warning' : 'info',
        live,
        recommendation: recommendationFor(area, 'live-only'),
      });
      continue;
    }

    if (backup !== undefined && live === undefined) {
      conflicts.push({
        area,
        id,
        type: 'backup-only',
        severity: severityForBackupOnly(area),
        backup,
        recommendation: recommendationFor(area, 'backup-only'),
      });
      continue;
    }

    if (backup === undefined || live === undefined || recordsEqual(backup, live)) {
      continue;
    }

    const type = liveIsNewer(backup, live) ? 'newer-live' : 'changed';
    conflicts.push({
      area,
      id,
      type,
      severity: severityFor(area, type),
      backup,
      live,
      recommendation: recommendationFor(area, type),
    });
  }

  return conflicts;
}

function indexById(records: readonly RestorePreviewRecord[]): Map<string, RestorePreviewRecord> {
  const byId = new Map<string, RestorePreviewRecord>();
  for (const record of records) {
    byId.set(record.id, record);
  }
  return byId;
}

function recordsEqual(backup: RestorePreviewRecord, live: RestorePreviewRecord): boolean {
  return recordFingerprint(backup) === recordFingerprint(live);
}

function recordFingerprint(record: RestorePreviewRecord): string {
  return stableStringify({
    id: record.id,
    digest: record.digest,
    state: record.state,
    updatedAt: record.updatedAt,
    value: record.value,
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function liveIsNewer(backup: RestorePreviewRecord, live: RestorePreviewRecord): boolean {
  if (backup.updatedAt === undefined || live.updatedAt === undefined) return false;
  const backupTime = Date.parse(backup.updatedAt);
  const liveTime = Date.parse(live.updatedAt);
  return Number.isFinite(backupTime) && Number.isFinite(liveTime) && liveTime > backupTime;
}

function severityForBackupOnly(area: ComparableArea): RestorePreviewSeverity {
  if (area === 'approvals' || area === 'tasks') return 'blocker';
  return 'info';
}

function severityFor(area: ComparableArea, type: RestorePreviewConflictType): RestorePreviewSeverity {
  if (area === 'approvals') return 'blocker';
  if (type === 'newer-live') return 'warning';
  return 'warning';
}

function recommendationFor(area: ComparableArea, type: RestorePreviewConflictType): string {
  switch (area) {
    case 'tasks':
      return type === 'backup-only'
        ? 'Do not resurrect a backup-only Kanban card automatically. Confirm whether the live card was deleted, completed, or reassigned, then explicitly recreate a new card or skip this backup record.'
        : type === 'newer-live'
          ? 'Review and merge task/card changes or restore only selected stale fields; do not overwrite newer live task state blindly.'
          : type === 'live-only'
            ? 'preserve the live task/card unless the operator explicitly chooses to delete or archive it during restore.'
            : 'Review task/card delta and choose overwrite, merge, or skip for this item.';
    case 'approvals':
      return 'Skip approval token restore and require re-approval so stale or changed approval state cannot authorize live actions.';
    case 'memory':
      return type === 'live-only'
        ? 'Preserve the live memory entry unless the operator explicitly prunes it.'
        : 'Review and merge memory differences, or skip restore for this entry to avoid losing live context.';
    case 'cron':
      return type === 'live-only'
        ? 'preserve the live cron job unless the operator explicitly removes it.'
        : 'Review cron drift and explicitly restore, merge, or skip this job; do not overwrite schedules blindly.';
  }
}
