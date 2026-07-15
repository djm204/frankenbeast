import { readFile } from 'node:fs/promises';

import {
  buildRestoreDryRunReport,
  type RestorePreviewManifest,
} from '../dr/restore-preview.js';

export interface DrCommandDeps {
  readonly action: 'restore-dry-run' | undefined;
  readonly backupManifestPath?: string | undefined;
  readonly liveManifestPath?: string | undefined;
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
  for (const [index, record] of value.entries()) {
    if (!isRecord(record) || typeof record.id !== 'string' || record.id.length === 0) {
      throw new Error(`Invalid restore manifest ${manifestPath}: ${field}[${index}] must include a non-empty string id`);
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
  const { action, backupManifestPath, liveManifestPath, print } = deps;
  if (action !== 'restore-dry-run') {
    throw new Error('Usage: frankenbeast dr restore-dry-run <backup-manifest.json> <live-manifest.json>');
  }
  if (!backupManifestPath || !liveManifestPath) {
    throw new Error('dr restore-dry-run requires two manifest JSON files: <backup-manifest.json> <live-manifest.json>');
  }

  const [backup, live] = await Promise.all([
    readRestoreManifest(backupManifestPath),
    readRestoreManifest(liveManifestPath),
  ]);

  print(JSON.stringify(buildRestoreDryRunReport(backup, live, {
    ...(deps.generatedAt === undefined ? {} : { generatedAt: deps.generatedAt }),
    backupPath: backupManifestPath,
    livePath: liveManifestPath,
  }), null, 2));
}
