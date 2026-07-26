import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import {
  RuntimeActionResultSchema,
  type RuntimeActionAudit,
  type RuntimeActionResult,
} from './runtime-schemas.js';

export interface RuntimeActionAuditEvent extends RuntimeActionAudit {
  providerId: string;
  correlationId: string;
  causationId?: string | undefined;
}

export type RuntimeActionReservation =
  | { status: 'claimed' }
  | { status: 'conflict' }
  | { status: 'pending' }
  | { status: 'completed'; result: RuntimeActionResult };

export interface RuntimeActionStoreOptions {
  databasePath?: string | undefined;
}

interface MemoryEntry {
  fingerprint: string;
  expiresAt: number;
  result?: RuntimeActionResult | undefined;
}

interface PersistedEntry {
  fingerprint: string;
  expires_at: number;
  result_json: string | null;
}

interface PersistedAuditEvent {
  event_json: string;
}

export class RuntimeActionStore {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly auditEvents: RuntimeActionAuditEvent[] = [];
  private readonly pending = new Set<Promise<unknown>>();
  private readonly db: Database.Database | undefined;
  private destroyed = false;
  private shuttingDown = false;

  constructor(options: RuntimeActionStoreOptions = {}) {
    if (!options.databasePath) return;
    mkdirSync(dirname(options.databasePath), { recursive: true, mode: 0o700 });
    this.db = new Database(options.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_action_idempotency (
        action_key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        result_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runtime_action_idempotency_expiry
        ON runtime_action_idempotency(expires_at);
      CREATE TABLE IF NOT EXISTS runtime_action_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at INTEGER NOT NULL,
        event_json TEXT NOT NULL
      );
    `);
  }

  reserve(key: string, fingerprint: string, expiresAt: number, now = Date.now()): RuntimeActionReservation {
    if (this.shuttingDown) throw new Error('Runtime action store is shutting down');
    if (!this.db) return this.reserveMemory(key, fingerprint, expiresAt, now);
    const reserve = this.db.transaction((): RuntimeActionReservation => {
      this.db!.prepare('DELETE FROM runtime_action_idempotency WHERE expires_at <= ?').run(now);
      const existing = this.db!.prepare(`
        SELECT fingerprint, expires_at, result_json
        FROM runtime_action_idempotency
        WHERE action_key = ?
      `).get(key) as PersistedEntry | undefined;
      if (existing) return this.reservationFor(existing.fingerprint, existing.result_json, fingerprint);
      this.db!.prepare(`
        INSERT INTO runtime_action_idempotency (action_key, fingerprint, expires_at, result_json)
        VALUES (?, ?, ?, NULL)
      `).run(key, fingerprint, expiresAt);
      return { status: 'claimed' };
    });
    return reserve.immediate();
  }

  complete(key: string, fingerprint: string, result: RuntimeActionResult): void {
    const parsed = RuntimeActionResultSchema.parse(result);
    if (!this.db) {
      const entry = this.entries.get(key);
      if (!entry || entry.fingerprint !== fingerprint) throw new Error('Runtime action reservation was lost');
      entry.result = parsed;
      return;
    }
    const update = this.db.prepare(`
      UPDATE runtime_action_idempotency
      SET result_json = ?
      WHERE action_key = ? AND fingerprint = ?
    `).run(JSON.stringify(parsed), key, fingerprint);
    if (update.changes !== 1) throw new Error('Runtime action reservation was lost');
  }

  recordAudit(event: RuntimeActionAuditEvent, occurredAt = Date.now()): void {
    const copy = { ...event };
    if (!this.db) {
      this.auditEvents.push(copy);
      return;
    }
    this.db.prepare(`
      INSERT INTO runtime_action_audit (occurred_at, event_json)
      VALUES (?, ?)
    `).run(occurredAt, JSON.stringify(copy));
  }

  listAuditEvents(): RuntimeActionAuditEvent[] {
    if (!this.db) return this.auditEvents.map((event) => ({ ...event }));
    return (this.db.prepare(`
      SELECT event_json FROM runtime_action_audit ORDER BY id ASC
    `).all() as PersistedAuditEvent[]).map(({ event_json }) => JSON.parse(event_json) as RuntimeActionAuditEvent);
  }

  track<T>(operation: Promise<T>): Promise<T> {
    const tracked = operation.finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    return tracked;
  }

  beginShutdown(): void {
    this.shuttingDown = true;
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.db?.close();
  }

  private reserveMemory(
    key: string,
    fingerprint: string,
    expiresAt: number,
    now: number,
  ): RuntimeActionReservation {
    for (const [storedKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(storedKey);
    }
    const existing = this.entries.get(key);
    if (existing) {
      return existing.fingerprint !== fingerprint
        ? { status: 'conflict' }
        : existing.result
          ? { status: 'completed', result: existing.result }
          : { status: 'pending' };
    }
    this.entries.set(key, { fingerprint, expiresAt });
    return { status: 'claimed' };
  }

  private reservationFor(
    storedFingerprint: string,
    resultJson: string | null,
    requestedFingerprint: string,
  ): RuntimeActionReservation {
    if (storedFingerprint !== requestedFingerprint) return { status: 'conflict' };
    if (resultJson === null) return { status: 'pending' };
    return { status: 'completed', result: RuntimeActionResultSchema.parse(JSON.parse(resultJson)) };
  }
}
