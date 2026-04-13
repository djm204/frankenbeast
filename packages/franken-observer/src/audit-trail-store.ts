import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuditTrail } from './audit-event.js';

export interface PersistedAuditTrail {
  version: 1;
  runId: string;
  createdAt: string;
  events: import('./audit-event.js').AuditEvent[];
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

  save(runId: string, trail: AuditTrail): string {
    mkdirSync(this.auditDir, { recursive: true });

    const filePath = join(this.auditDir, `${runId}.json`);
    const artifact: PersistedAuditTrail = {
      version: 1,
      runId,
      createdAt: new Date().toISOString(),
      events: trail.toJSON(),
    };
    writeFileSync(filePath, JSON.stringify(artifact, null, 2));
    return filePath;
  }

  load(runId: string): AuditTrail {
    const filePath = join(this.auditDir, `${runId}.json`);
    if (!existsSync(filePath)) {
      throw new Error(`Audit trail not found: ${filePath}`);
    }
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as PersistedAuditTrail;
    return AuditTrail.fromJSON(raw.events);
  }

  exists(runId: string): boolean {
    return existsSync(join(this.auditDir, `${runId}.json`));
  }
}
