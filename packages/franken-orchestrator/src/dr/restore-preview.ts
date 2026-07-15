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

export type RestorePreviewConflictType =
  | 'schema-mismatch'
  | 'changed'
  | 'newer-live'
  | 'backup-only'
  | 'live-only';

export type RestorePreviewSeverity = 'info' | 'warning' | 'blocker';

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

type ComparableArea = Exclude<RestorePreviewArea, 'schema'>;

const AREA_ACCESSORS = {
  tasks: (manifest: RestorePreviewManifest) => manifest.tasks ?? [],
  approvals: (manifest: RestorePreviewManifest) => manifest.approvals ?? [],
  memory: (manifest: RestorePreviewManifest) => manifest.memory ?? [],
  cron: (manifest: RestorePreviewManifest) => manifest.cron ?? [],
} satisfies Record<ComparableArea, (manifest: RestorePreviewManifest) => readonly RestorePreviewRecord[]>;

const DEFAULT_ALLOWED_BACKUP_ENCRYPTION_ALGORITHMS = ['aes-256-gcm', 'xchacha20-poly1305'] as const;

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

function statusForEncryptionFindings(
  findings: readonly BackupEncryptionVerificationFinding[],
): BackupEncryptionVerificationStatus {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'failed';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning';
  return 'verified';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

  return [
    {
      area: conflict.area,
      id: conflict.id,
      type: 'overwrite-live-record',
      reason: 'Applying the backup record would overwrite or replace current live state.',
    },
  ];
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
