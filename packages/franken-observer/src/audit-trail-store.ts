import * as fs from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { AuditTrail, assertAuditEventArray } from './audit-event.js';
import type { ReplayRecord } from './replay/replay-record.js';
import { isoNow } from '@franken/types';

export interface PersistedAuditTrail {
  version: 1;
  runId: string;
  createdAt: string;
  events: import('./audit-event.js').AuditEvent[];
}

export class AuditTrailCorruptionError extends Error {
  readonly runId: string;
  readonly path: string;

  constructor(runId: string, path: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Corrupt audit trail for run ${JSON.stringify(runId)} at ${path}: ${detail}`);
    this.name = 'AuditTrailCorruptionError';
    this.runId = runId;
    this.path = path;
    this.cause = cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPersistedAuditTrail(value: unknown): asserts value is PersistedAuditTrail {
  if (!isRecord(value)) {
    throw new Error('Invalid persisted audit trail: expected object');
  }
  if (value.version !== 1) {
    throw new Error('Invalid persisted audit trail: version must be 1');
  }
  if (typeof value.runId !== 'string' || value.runId.length === 0) {
    throw new Error('Invalid persisted audit trail: runId must be a non-empty string');
  }
  if (typeof value.createdAt !== 'string' || value.createdAt.length === 0) {
    throw new Error('Invalid persisted audit trail: createdAt must be a non-empty string');
  }
  assertAuditEventArray(value.events, 'events');
}

function normalizePersistedAuditTrail(value: unknown): unknown {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) {
    return value;
  }

  return {
    ...value,
    events: value.events.map((event) => {
      if (!isRecord(event) || Object.prototype.hasOwnProperty.call(event, 'payload')) {
        return event;
      }
      return { ...event, payload: null };
    }),
  };
}

/**
 * Allowed run ID characters. Restricting to a single safe filename segment
 * prevents path traversal (`../`), absolute paths, and separator injection
 * when a run ID is interpolated into a filesystem path.
 */
const SAFE_RUN_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Validates a run ID as a safe single filename segment before it is used to
 * build a filesystem path. Rejects empty values, `.`/`..`, and any value
 * containing path separators or characters outside the safe set.
 */
function assertSafeRunId(runId: string): void {
  if (typeof runId !== 'string' || runId === '.' || runId === '..' || !SAFE_RUN_ID.test(runId)) {
    throw new Error(`Invalid run id: ${JSON.stringify(runId)}`);
  }
}

/**
 * Builds a path under `auditDir` for the given run ID and file suffix.
 * Defense in depth on top of `assertSafeRunId`: even if the safe-character
 * pattern were ever loosened, this resolves the final path and asserts it
 * stays within `auditDir` before returning it, so a crafted run ID can never
 * cause a save/load/exists call to touch a file outside the audit directory.
 */
function safeAuditPath(auditDir: string, runId: string, suffix: string): string {
  assertSafeRunId(runId);
  const filePath = join(auditDir, `${runId}${suffix}`);
  const resolvedDir = resolve(auditDir);
  const resolvedFile = resolve(filePath);
  if (resolvedFile !== resolvedDir && !resolvedFile.startsWith(resolvedDir + sep)) {
    throw new Error(`Invalid run id: ${JSON.stringify(runId)}`);
  }
  return filePath;
}

function fsyncDirectory(dirPath: string): void {
  let directory: number | undefined;
  try {
    directory = fs.openSync(dirPath, 'r');
    fs.fsyncSync(directory);
  } catch {
    // Some platforms/filesystems do not support directory fsync. The temp-file
    // plus rename sequence is still atomic for readers, so do not fail saves for
    // durability best-effort failures here.
  } finally {
    if (directory !== undefined) {
      try {
        fs.closeSync(directory);
      } catch {
        // Directory fsync/close is a durability best-effort only. Do not report
        // an already-renamed artifact as failed because cleanup close failed.
      }
    }
  }
}

function cleanupTempFile(path: string): void {
  try {
    fs.rmSync(path, { force: true });
  } catch {
    // Best-effort cleanup only; preserve the original write/rename error.
  }
}

function writeTempFile(finalPath: string, contents: string): string {
  const mode = fs.existsSync(finalPath) ? fs.statSync(finalPath).mode & 0o777 : 0o666;
  const tempPath = join(
    resolve(finalPath, '..'),
    `.${basename(finalPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  let file: number | undefined;
  try {
    file = fs.openSync(tempPath, 'wx', mode);
    fs.writeFileSync(file, contents);
    fs.fsyncSync(file);
  } catch (error) {
    if (file !== undefined) {
      try {
        fs.closeSync(file);
      } catch {
        // Preserve the original write/fsync error.
      }
      file = undefined;
    }
    cleanupTempFile(tempPath);
    throw error;
  } finally {
    if (file !== undefined) {
      fs.closeSync(file);
    }
  }
  return tempPath;
}

function commitTempFile(tempPath: string, finalPath: string): void {
  try {
    fs.renameSync(tempPath, finalPath);
    fsyncDirectory(resolve(finalPath, '..'));
  } catch (error) {
    cleanupTempFile(tempPath);
    throw error;
  }
}

function writeJsonFileAtomically(finalPath: string, value: unknown): void {
  const tempPath = writeTempFile(finalPath, JSON.stringify(value, null, 2));
  commitTempFile(tempPath, finalPath);
}

/**
 * Persists audit trails as JSON files under .fbeast/audit/.
 * One file per run: <runId>.json.
 */
export class AuditTrailStore {
  private readonly auditDir: string;

  constructor(projectRoot: string) {
    this.auditDir = join(projectRoot, '.fbeast', 'audit');
  }

  save(runId: string, trail: AuditTrail, manifest?: readonly ReplayRecord[]): string {
    const filePath = safeAuditPath(this.auditDir, runId, '.json');
    const replayPath = manifest ? safeAuditPath(this.auditDir, runId, '.replay.json') : undefined;
    fs.mkdirSync(this.auditDir, { recursive: true });

    const artifact: PersistedAuditTrail = {
      version: 1,
      runId,
      createdAt: isoNow(),
      events: trail.toJSON(),
    };

    const auditTempPath = writeTempFile(filePath, JSON.stringify(artifact, null, 2));
    let replayTempPath: string | undefined;
    try {
      if (manifest && replayPath) {
        replayTempPath = writeTempFile(replayPath, JSON.stringify(manifest, null, 2));
        // Commit replay before audit so a replay-manifest failure cannot leave a
        // newly written primary audit that appears fully replayable.
        commitTempFile(replayTempPath, replayPath);
        replayTempPath = undefined;
      }
      commitTempFile(auditTempPath, filePath);
    } catch (error) {
      cleanupTempFile(auditTempPath);
      if (replayTempPath) {
        cleanupTempFile(replayTempPath);
      }
      throw error;
    }
    return filePath;
  }

  saveReplayManifest(runId: string, manifest: readonly ReplayRecord[]): string {
    const replayPath = safeAuditPath(this.auditDir, runId, '.replay.json');
    fs.mkdirSync(this.auditDir, { recursive: true });
    writeJsonFileAtomically(replayPath, manifest);
    return replayPath;
  }

  load(runId: string): AuditTrail {
    const filePath = safeAuditPath(this.auditDir, runId, '.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audit trail not found: ${filePath}`);
    }

    try {
      const raw = normalizePersistedAuditTrail(JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown);
      assertPersistedAuditTrail(raw);
      return AuditTrail.fromJSON(raw.events);
    } catch (error) {
      throw new AuditTrailCorruptionError(runId, filePath, error);
    }
  }

  exists(runId: string): boolean {
    return fs.existsSync(safeAuditPath(this.auditDir, runId, '.json'));
  }
}
