import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { constantTimeTokenEqual } from '../../http/security/constant-time.js';

interface TicketEntry {
  tokenDigest: string;
  scope?: string | undefined;
  expiresAt: number;
}

interface PersistedTicketRow {
  token_digest: string;
  scope: string | null;
  state: 'issued' | 'consumed';
  expires_at: number;
  consumed_until: number | null;
}

export interface SseConnectionTicketStoreOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
  /** Best-effort observer for periodic cleanup failures. */
  onCleanupError?: (error: unknown) => void;
  /** SQLite database shared by daemon processes. Omit only for isolated/test stores. */
  databasePath?: string;
  /**
   * How long a consumed ticket is remembered (for reused → 204 detection)
   * after it is burned. Defaults to well beyond the issue TTL so long-lived
   * EventSource reconnects still resolve as `reused`.
   */
  consumedRetentionMs?: number;
}

export type SseTicketStatus = 'valid' | 'invalid' | 'reused';

const DEFAULT_TICKET_TTL_MS = 30_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;
const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;
const MIN_CONSUMED_RETENTION_MS = 600_000;

function resolvePositiveDurationMs(
  name: string,
  value: number | undefined,
  defaultValue: number,
  maxValue?: number,
): number {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} must be a finite positive integer number of milliseconds`);
  }
  if (maxValue !== undefined && resolved > maxValue) {
    throw new RangeError(`${name} must be at most ${maxValue} milliseconds`);
  }
  return resolved;
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SseConnectionTicketStore {
  private readonly tickets = new Map<string, TicketEntry>();
  // Consumed tickets are remembered past the issue TTL so that an EventSource
  // reconnecting on a long-lived stream is recognized as `reused` (→ 204) and
  // its native retry loop stops, instead of falling through to `invalid` (401).
  private readonly consumedTickets = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly consumedRetentionMs: number;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;
  private readonly db: Database.Database | undefined;
  private destroyed = false;

  constructor(options?: SseConnectionTicketStoreOptions) {
    this.ttlMs = resolvePositiveDurationMs('ttlMs', options?.ttlMs, DEFAULT_TICKET_TTL_MS);
    this.consumedRetentionMs = resolvePositiveDurationMs(
      'consumedRetentionMs',
      options?.consumedRetentionMs,
      Math.max(this.ttlMs * 20, MIN_CONSUMED_RETENTION_MS),
    );
    const cleanupMs = resolvePositiveDurationMs(
      'cleanupIntervalMs',
      options?.cleanupIntervalMs,
      DEFAULT_CLEANUP_INTERVAL_MS,
      MAX_NODE_TIMER_DELAY_MS,
    );

    if (options?.databasePath) {
      mkdirSync(dirname(options.databasePath), { recursive: true });
      this.db = new Database(options.databasePath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sse_connection_tickets (
          ticket TEXT PRIMARY KEY,
          token_digest TEXT NOT NULL,
          scope TEXT,
          state TEXT NOT NULL CHECK (state IN ('issued', 'consumed')),
          expires_at INTEGER NOT NULL,
          consumed_until INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_sse_connection_tickets_expiry
          ON sse_connection_tickets(state, expires_at, consumed_until);
      `);
    }

    this.cleanupInterval = setInterval(() => {
      try {
        this.cleanup();
      } catch (error) {
        // Cleanup is opportunistic. A transient SQLITE_BUSY/I/O failure must
        // not escape the timer callback and terminate the daemon; the next
        // interval retries it.
        try {
          options?.onCleanupError?.(error);
        } catch {
          // Observability hooks must not turn a recoverable cleanup failure
          // back into an uncaught timer exception.
        }
      }
    }, cleanupMs);
    this.cleanupInterval.unref?.();
  }

  issue(token: string, scope?: string | undefined): string {
    const ticket = randomUUID();
    const tokenDigest = digestToken(token);
    const expiresAt = Date.now() + this.ttlMs;

    if (this.db) {
      this.db.prepare(`
        INSERT INTO sse_connection_tickets
          (ticket, token_digest, scope, state, expires_at, consumed_until)
        VALUES (?, ?, ?, 'issued', ?, NULL)
      `).run(ticket, tokenDigest, scope ?? null, expiresAt);
    } else {
      this.tickets.set(ticket, { tokenDigest, scope, expiresAt });
    }
    return ticket;
  }

  consume(ticket: string, operatorToken: string, scope?: string | undefined): SseTicketStatus {
    if (this.db) {
      return this.consumePersisted(ticket, operatorToken, scope);
    }

    const entry = this.tickets.get(ticket);
    if (!entry) {
      const consumedExpiry = this.consumedTickets.get(ticket);
      if (consumedExpiry !== undefined) {
        if (Date.now() <= consumedExpiry) {
          return 'reused';
        }
        this.consumedTickets.delete(ticket);
      }
      return 'invalid';
    }

    this.tickets.delete(ticket);

    if (Date.now() > entry.expiresAt) {
      return 'invalid';
    }
    if (entry.scope !== scope) {
      return 'invalid';
    }
    if (!constantTimeTokenEqual(digestToken(operatorToken), entry.tokenDigest)) {
      return 'invalid';
    }

    this.consumedTickets.set(ticket, Date.now() + this.consumedRetentionMs);
    return 'valid';
  }

  validate(ticket: string, operatorToken: string, scope?: string | undefined): boolean {
    return this.consume(ticket, operatorToken, scope) === 'valid';
  }

  private consumePersisted(
    ticket: string,
    operatorToken: string,
    scope?: string | undefined,
  ): SseTicketStatus {
    const db = this.db;
    if (!db) return 'invalid';

    const consume = db.transaction((): SseTicketStatus => {
      const now = Date.now();
      const entry = db.prepare(`
        SELECT token_digest, scope, state, expires_at, consumed_until
        FROM sse_connection_tickets
        WHERE ticket = ?
      `).get(ticket) as PersistedTicketRow | undefined;

      if (!entry) return 'invalid';
      if (entry.state === 'consumed') {
        if (entry.consumed_until !== null && now <= entry.consumed_until) return 'reused';
        db.prepare('DELETE FROM sse_connection_tickets WHERE ticket = ?').run(ticket);
        return 'invalid';
      }

      // Burn the issued ticket before returning, including failed validation,
      // while the IMMEDIATE transaction serializes consumers across processes.
      if (
        now > entry.expires_at
        || entry.scope !== (scope ?? null)
        || !constantTimeTokenEqual(digestToken(operatorToken), entry.token_digest)
      ) {
        db.prepare('DELETE FROM sse_connection_tickets WHERE ticket = ?').run(ticket);
        return 'invalid';
      }

      db.prepare(`
        UPDATE sse_connection_tickets
        SET state = 'consumed', token_digest = '', scope = NULL, consumed_until = ?
        WHERE ticket = ?
      `).run(now + this.consumedRetentionMs, ticket);
      return 'valid';
    });

    return consume.immediate();
  }

  private cleanup(): void {
    const now = Date.now();
    if (this.db) {
      this.db.prepare(`
        DELETE FROM sse_connection_tickets
        WHERE (state = 'issued' AND expires_at < ?)
           OR (state = 'consumed' AND consumed_until < ?)
      `).run(now, now);
      return;
    }

    for (const [ticket, entry] of this.tickets) {
      if (now > entry.expiresAt) this.tickets.delete(ticket);
    }
    for (const [ticket, expiry] of this.consumedTickets) {
      if (now > expiry) this.consumedTickets.delete(ticket);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.cleanupInterval);
    this.db?.close();
  }
}
