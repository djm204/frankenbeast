import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuditTrail } from './audit-event.js';
import type { ReplayRecord } from './replay/replay-record.js';

export interface PersistedAuditTrail {
  version: 1;
  runId: string;
  createdAt: string;
  events: import('./audit-event.js').AuditEvent[];
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
 * Persists audit trails as JSON files under .fbeast/audit/.
 * One file per run: <runId>.json.
 */
export class AuditTrailStore {
  private readonly auditDir: string;

  constructor(projectRoot: string) {
    this.auditDir = join(projectRoot, '.fbeast', 'audit');
  }

  save(runId: string, trail: AuditTrail, manifest?: readonly ReplayRecord[]): string {
    assertSafeRunId(runId);
    mkdirSync(this.auditDir, { recursive: true });

    const filePath = join(this.auditDir, `${runId}.json`);
    const artifact: PersistedAuditTrail = {
      version: 1,
      runId,
      createdAt: new Date().toISOString(),
      events: trail.toJSON(),
    };
    writeFileSync(filePath, JSON.stringify(artifact, null, 2));
    if (manifest) {
      writeFileSync(join(this.auditDir, `${runId}.replay.json`), JSON.stringify(manifest, null, 2));
    }
    return filePath;
  }

  load(runId: string): AuditTrail {
    assertSafeRunId(runId);
    const filePath = join(this.auditDir, `${runId}.json`);
    if (!existsSync(filePath)) {
      throw new Error(`Audit trail not found: ${filePath}`);
    }
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as PersistedAuditTrail;
    return AuditTrail.fromJSON(raw.events);
  }

  exists(runId: string): boolean {
    assertSafeRunId(runId);
    return existsSync(join(this.auditDir, `${runId}.json`));
  }
}
