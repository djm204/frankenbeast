import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AuditTrail, assertAuditEventArray } from './audit-event.js';
import type { ReplayRecord } from './replay/replay-record.js';
import { isoNow } from '@franken/types';

export interface PersistedAuditTrail {
  version: 1;
  runId: string;
  createdAt: string;
  events: import('./audit-event.js').AuditEvent[];
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
    mkdirSync(this.auditDir, { recursive: true });

    const artifact: PersistedAuditTrail = {
      version: 1,
      runId,
      createdAt: isoNow(),
      events: trail.toJSON(),
    };
    writeFileSync(filePath, JSON.stringify(artifact, null, 2));
    if (manifest) {
      writeFileSync(safeAuditPath(this.auditDir, runId, '.replay.json'), JSON.stringify(manifest, null, 2));
    }
    return filePath;
  }

  load(runId: string): AuditTrail {
    const filePath = safeAuditPath(this.auditDir, runId, '.json');
    if (!existsSync(filePath)) {
      throw new Error(`Audit trail not found: ${filePath}`);
    }
    const raw = normalizePersistedAuditTrail(JSON.parse(readFileSync(filePath, 'utf-8')) as unknown);
    assertPersistedAuditTrail(raw);
    return AuditTrail.fromJSON(raw.events);
  }

  exists(runId: string): boolean {
    return existsSync(safeAuditPath(this.auditDir, runId, '.json'));
  }
}
