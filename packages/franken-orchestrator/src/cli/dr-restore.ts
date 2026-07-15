import { readFile, realpath } from 'node:fs/promises';

import {
  buildRestoreDryRunReport,
  type RestorePreviewManifest,
} from '../dr/restore-preview.js';
import {
  createEncryptedStateBackup,
  readStateBackupEnvelope,
  restoreEncryptedStateBackup,
  verifyEncryptedStateBackup,
} from '../dr/state-backup.js';

export interface DrCommandDeps {
  readonly action: 'backup' | 'list' | 'verify' | 'restore' | 'restore-dry-run' | undefined;
  readonly backupManifestPath?: string | undefined;
  readonly liveManifestPath?: string | undefined;
  readonly keyFilePath?: string | undefined;
  readonly dryRun?: boolean | undefined;
  readonly generatedAt?: string | undefined;
  readonly print: (message: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRecordArray(manifestPath: string, manifest: Record<string, unknown>, field: string): void {
  const value = manifest[field];
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid restore manifest ${manifestPath}: ${field} must be an array when present`);
  }
  const allowedFields = new Set(['id', 'digest', 'state', 'updatedAt', 'value']);
  for (const [index, record] of value.entries()) {
    if (!isRecord(record)) {
      throw new Error(`Invalid restore manifest ${manifestPath}: ${field}[${index}] must be an object`);
    }
    for (const recordField of Object.keys(record)) {
      if (!allowedFields.has(recordField)) {
        throw new Error(`Invalid restore manifest ${manifestPath}: ${field}[${index}] includes unsupported field '${recordField}'`);
      }
    }
    for (const stringField of ['digest', 'state', 'updatedAt']) {
      if (record[stringField] !== undefined && typeof record[stringField] !== 'string') {
        throw new Error(`Invalid restore manifest ${manifestPath}: ${field}[${index}].${stringField} must be a string when present`);
      }
    }
  }
}

export async function readRestoreManifest(manifestPath: string): Promise<RestorePreviewManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read restore manifest ${manifestPath}: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid restore manifest ${manifestPath}: expected a JSON object`);
  }
  if (!Number.isSafeInteger(parsed.schemaVersion)) {
    throw new Error(`Invalid restore manifest ${manifestPath}: schemaVersion must be a safe integer`);
  }
  for (const field of ['tasks', 'approvals', 'memory', 'cron']) {
    validateRecordArray(manifestPath, parsed, field);
  }

  return parsed as unknown as RestorePreviewManifest;
}

export async function handleDrCommand(deps: DrCommandDeps): Promise<void> {
  const { action, backupManifestPath, liveManifestPath, keyFilePath, print } = deps;
  if (action === 'backup') {
    if (!backupManifestPath || !liveManifestPath || !keyFilePath) {
      throw new Error('dr backup requires <state-dir> <backup-file> <key-file>');
    }
    print(JSON.stringify(await createEncryptedStateBackup({
      stateDir: backupManifestPath,
      outputPath: liveManifestPath,
      keyFilePath,
      ...(deps.generatedAt === undefined ? {} : { generatedAt: deps.generatedAt }),
    }), null, 2));
    return;
  }

  if (action === 'list') {
    if (!backupManifestPath) {
      throw new Error('dr list requires <backup-file>');
    }
    const envelope = await readStateBackupEnvelope(backupManifestPath);
    print(JSON.stringify({
      ok: true,
      command: 'dr list',
      encrypted: envelope.encryption.encrypted,
      algorithm: envelope.encryption.algorithm,
      manifest: envelope.manifest,
    }, null, 2));
    return;
  }

  if (action === 'verify') {
    if (!backupManifestPath || !liveManifestPath) {
      throw new Error('dr verify requires <backup-file> <key-file>');
    }
    print(JSON.stringify(await verifyEncryptedStateBackup(backupManifestPath, liveManifestPath), null, 2));
    return;
  }

  if (action === 'restore') {
    if (!backupManifestPath || !liveManifestPath || !keyFilePath) {
      throw new Error('dr restore requires <backup-file> <target-dir> <key-file>');
    }
    print(JSON.stringify(await restoreEncryptedStateBackup({
      backupPath: backupManifestPath,
      targetDir: liveManifestPath,
      keyFilePath,
      dryRun: deps.dryRun === true,
    }), null, 2));
    return;
  }

  if (action !== 'restore-dry-run') {
    throw new Error('Usage: frankenbeast dr <backup|list|verify|restore|restore-dry-run> ...');
  }
  if (!backupManifestPath || !liveManifestPath) {
    throw new Error('dr restore-dry-run requires two manifest JSON files: <backup-manifest.json> <live-manifest.json>');
  }

  const [resolvedBackupPath, resolvedLivePath] = await Promise.all([
    realpath(backupManifestPath),
    realpath(liveManifestPath),
  ]);
  if (resolvedBackupPath === resolvedLivePath) {
    throw new Error('dr restore-dry-run requires distinct backup and live manifest files');
  }

  const [backup, live] = await Promise.all([
    readRestoreManifest(resolvedBackupPath),
    readRestoreManifest(resolvedLivePath),
  ]);

  print(JSON.stringify(buildRestoreDryRunReport(backup, live, {
    ...(deps.generatedAt === undefined ? {} : { generatedAt: deps.generatedAt }),
    backupPath: resolvedBackupPath,
    livePath: resolvedLivePath,
  }), null, 2));
}
