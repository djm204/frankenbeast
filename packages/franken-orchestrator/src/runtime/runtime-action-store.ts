import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
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
  | { status: 'claimed'; claimToken: string }
  | { status: 'conflict' }
  | { status: 'pending' }
  | { status: 'completed'; result: RuntimeActionResult };

export interface RuntimeActionStoreOptions {
  databasePath?: string | undefined;
  hardenDatabaseDirectory?: boolean | undefined;
}

interface MemoryEntry {
  fingerprint: string;
  claimToken: string;
  expiresAt: number;
  result?: RuntimeActionResult | undefined;
}

interface PersistedEntry {
  fingerprint: string;
  claim_token: string | null;
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
  private readonly activeClaims = new Map<string, { key: string; fingerprint: string }>();
  private readonly db: Database.Database | undefined;
  private destroyed = false;
  private shuttingDown = false;

  constructor(options: RuntimeActionStoreOptions = {}) {
    if (!options.databasePath) return;
    const databaseDir = dirname(options.databasePath);
    mkdirSync(databaseDir, { recursive: true, mode: 0o700 });
    if (options.hardenDatabaseDirectory) chmodSync(databaseDir, 0o700);
    this.db = new Database(options.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_action_idempotency (
        action_key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        claim_token TEXT,
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
    const idempotencyColumns = this.db.pragma('table_info(runtime_action_idempotency)') as Array<{ name: string }>;
    if (!idempotencyColumns.some(({ name }) => name === 'claim_token')) {
      this.db.exec('ALTER TABLE runtime_action_idempotency ADD COLUMN claim_token TEXT');
    }
  }

  reserve(key: string, fingerprint: string, expiresAt: number, now = Date.now()): RuntimeActionReservation {
    if (this.shuttingDown) throw new Error('Runtime action store is shutting down');
    if (!this.db) {
      const reservation = this.reserveMemory(key, fingerprint, expiresAt, now);
      if (reservation.status === 'claimed') {
        this.activeClaims.set(reservation.claimToken, { key, fingerprint });
      }
      return reservation;
    }
    const claimToken = randomUUID();
    const reserve = this.db.transaction((): RuntimeActionReservation => {
      this.db!.prepare('DELETE FROM runtime_action_idempotency WHERE expires_at <= ?').run(now);
      const existing = this.db!.prepare(`
        SELECT fingerprint, claim_token, expires_at, result_json
        FROM runtime_action_idempotency
        WHERE action_key = ?
      `).get(key) as PersistedEntry | undefined;
      if (existing) return this.reservationFor(existing.fingerprint, existing.result_json, fingerprint);
      this.db!.prepare(`
        INSERT INTO runtime_action_idempotency (action_key, fingerprint, claim_token, expires_at, result_json)
        VALUES (?, ?, ?, ?, NULL)
      `).run(key, fingerprint, claimToken, expiresAt);
      return { status: 'claimed', claimToken };
    });
    const reservation = reserve.immediate();
    if (reservation.status === 'claimed') {
      this.activeClaims.set(reservation.claimToken, { key, fingerprint });
    }
    return reservation;
  }

  renew(key: string, fingerprint: string, claimToken: string, expiresAt: number): boolean {
    if (this.shuttingDown) return false;
    if (!this.db) {
      const entry = this.entries.get(key);
      if (!entry || entry.fingerprint !== fingerprint || entry.claimToken !== claimToken || entry.result) {
        this.activeClaims.delete(claimToken);
        return false;
      }
      entry.expiresAt = expiresAt;
      return true;
    }
    const update = this.db.prepare(`
      UPDATE runtime_action_idempotency
      SET expires_at = ?
      WHERE action_key = ? AND fingerprint = ? AND claim_token = ? AND result_json IS NULL
    `).run(expiresAt, key, fingerprint, claimToken);
    if (update.changes !== 1) this.activeClaims.delete(claimToken);
    return update.changes === 1;
  }

  complete(
    key: string,
    fingerprint: string,
    claimToken: string,
    result: RuntimeActionResult,
    expiresAt: number,
  ): void {
    const parsed = RuntimeActionResultSchema.parse(result);
    if (!this.db) {
      const entry = this.entries.get(key);
      if (!entry || entry.fingerprint !== fingerprint || entry.claimToken !== claimToken) {
        throw new Error('Runtime action reservation was lost');
      }
      entry.result = parsed;
      entry.expiresAt = expiresAt;
      this.activeClaims.delete(claimToken);
      return;
    }
    const update = this.db.prepare(`
      UPDATE runtime_action_idempotency
      SET result_json = ?, expires_at = ?
      WHERE action_key = ? AND fingerprint = ? AND claim_token = ?
    `).run(JSON.stringify(parsed), expiresAt, key, fingerprint, claimToken);
    if (update.changes !== 1) throw new Error('Runtime action reservation was lost');
    this.activeClaims.delete(claimToken);
  }

  completeWithAudit(
    key: string,
    fingerprint: string,
    claimToken: string,
    result: RuntimeActionResult,
    expiresAt: number,
    event: RuntimeActionAuditEvent,
    occurredAt = Date.now(),
  ): void {
    const parsed = RuntimeActionResultSchema.parse(result);
    const audit = { ...event };
    if (!this.db) {
      const entry = this.entries.get(key);
      if (!entry || entry.fingerprint !== fingerprint || entry.claimToken !== claimToken) {
        throw new Error('Runtime action reservation was lost');
      }
      entry.result = parsed;
      entry.expiresAt = expiresAt;
      this.auditEvents.push(audit);
      this.activeClaims.delete(claimToken);
      return;
    }
    const commit = this.db.transaction(() => {
      const update = this.db!.prepare(`
        UPDATE runtime_action_idempotency
        SET result_json = ?, expires_at = ?
        WHERE action_key = ? AND fingerprint = ? AND claim_token = ?
      `).run(JSON.stringify(parsed), expiresAt, key, fingerprint, claimToken);
      if (update.changes !== 1) throw new Error('Runtime action reservation was lost');
      this.db!.prepare(`
        INSERT INTO runtime_action_audit (occurred_at, event_json)
        VALUES (?, ?)
      `).run(occurredAt, JSON.stringify(audit));
    });
    commit.immediate();
    this.activeClaims.delete(claimToken);
  }

  fence(key: string, fingerprint: string, claimToken: string): void {
    const expiresAt = Number.MAX_SAFE_INTEGER;
    if (!this.db) {
      const entry = this.entries.get(key);
      if (!entry || entry.fingerprint !== fingerprint || entry.claimToken !== claimToken || entry.result) {
        throw new Error('Runtime action reservation was lost');
      }
      entry.expiresAt = expiresAt;
      this.activeClaims.delete(claimToken);
      return;
    }
    const update = this.db.prepare(`
      UPDATE runtime_action_idempotency
      SET expires_at = ?
      WHERE action_key = ? AND fingerprint = ? AND claim_token = ? AND result_json IS NULL
    `).run(expiresAt, key, fingerprint, claimToken);
    if (update.changes !== 1) throw new Error('Runtime action reservation was lost');
    this.activeClaims.delete(claimToken);
  }

  fenceWithAudit(
    key: string,
    fingerprint: string,
    claimToken: string,
    event: RuntimeActionAuditEvent,
    occurredAt = Date.now(),
  ): void {
    const audit = { ...event };
    if (!this.db) {
      const entry = this.entries.get(key);
      if (!entry || entry.fingerprint !== fingerprint || entry.claimToken !== claimToken || entry.result) {
        throw new Error('Runtime action reservation was lost');
      }
      entry.expiresAt = Number.MAX_SAFE_INTEGER;
      this.auditEvents.push(audit);
      this.activeClaims.delete(claimToken);
      return;
    }
    const commit = this.db.transaction(() => {
      const update = this.db!.prepare(`
        UPDATE runtime_action_idempotency
        SET expires_at = ?
        WHERE action_key = ? AND fingerprint = ? AND claim_token = ? AND result_json IS NULL
      `).run(Number.MAX_SAFE_INTEGER, key, fingerprint, claimToken);
      if (update.changes !== 1) throw new Error('Runtime action reservation was lost');
      this.db!.prepare(`
        INSERT INTO runtime_action_audit (occurred_at, event_json)
        VALUES (?, ?)
      `).run(occurredAt, JSON.stringify(audit));
    });
    commit.immediate();
    this.activeClaims.delete(claimToken);
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
    const errors: unknown[] = [];
    for (const [claimToken, { key, fingerprint }] of this.activeClaims) {
      try {
        if (!this.db) {
          const entry = this.entries.get(key);
          if (entry && entry.fingerprint === fingerprint && entry.claimToken === claimToken && !entry.result) {
            entry.expiresAt = Number.MAX_SAFE_INTEGER;
          }
        } else {
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              this.db.prepare(`
                UPDATE runtime_action_idempotency
                SET expires_at = ?
                WHERE action_key = ? AND fingerprint = ? AND claim_token = ? AND result_json IS NULL
              `).run(Number.MAX_SAFE_INTEGER, key, fingerprint, claimToken);
              lastError = undefined;
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (lastError !== undefined) throw lastError;
        }
        this.activeClaims.delete(claimToken);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to fence runtime action claims');
  }

  async drain(timeoutMs?: number): Promise<boolean> {
    const pending = Promise.allSettled([...this.pending]).then(() => true);
    if (timeoutMs === undefined) return await pending;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), Math.max(0, timeoutMs)); }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
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
    const claimToken = randomUUID();
    this.entries.set(key, { fingerprint, claimToken, expiresAt });
    return { status: 'claimed', claimToken };
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
