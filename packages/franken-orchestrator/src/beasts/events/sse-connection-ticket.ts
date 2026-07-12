import { randomUUID } from 'node:crypto';
import { constantTimeTokenEqual } from '../../http/security/constant-time.js';
interface TicketEntry {
  token: string;
  scope?: string | undefined;
  expiresAt: number;
}


export interface SseConnectionTicketStoreOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
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

export class SseConnectionTicketStore {
  private readonly tickets = new Map<string, TicketEntry>();
  // Consumed tickets are remembered past the issue TTL so that an EventSource
  // reconnecting on a long-lived stream is recognized as `reused` (→ 204) and
  // its native retry loop stops, instead of falling through to `invalid` (401)
  // and looping. Retention is bounded (well beyond any realistic reconnect
  // window) so the set does not grow without limit. Maps ticket → expiry ts.
  private readonly consumedTickets = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly consumedRetentionMs: number;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(options?: SseConnectionTicketStoreOptions) {
    this.ttlMs = resolvePositiveDurationMs('ttlMs', options?.ttlMs, DEFAULT_TICKET_TTL_MS);
    // Cover EventSource's reconnect behaviour comfortably (>> ttl) while still
    // bounding memory: at least 10 minutes, or 20× the issue TTL if larger.
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
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
    this.cleanupInterval.unref?.();
  }

  issue(token: string, scope?: string | undefined): string {
    const ticket = randomUUID();
    this.tickets.set(ticket, {
      token,
      scope,
      expiresAt: Date.now() + this.ttlMs,
    });
    return ticket;
  }

  consume(ticket: string, operatorToken: string, scope?: string | undefined): SseTicketStatus {
    const entry = this.tickets.get(ticket);
    if (!entry) {
      const consumedExpiry = this.consumedTickets.get(ticket);
      if (consumedExpiry !== undefined) {
        if (Date.now() <= consumedExpiry) {
          return 'reused';
        }
        // Retention window elapsed — forget it and treat as invalid.
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

    if (!constantTimeTokenEqual(operatorToken, entry.token)) {
      return 'invalid';
    }

    this.consumedTickets.set(ticket, Date.now() + this.consumedRetentionMs);
    return 'valid';
  }

  validate(ticket: string, operatorToken: string, scope?: string | undefined): boolean {
    return this.consume(ticket, operatorToken, scope) === 'valid';
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ticket, entry] of this.tickets) {
      if (now > entry.expiresAt) {
        this.tickets.delete(ticket);
      }
    }
    for (const [ticket, expiry] of this.consumedTickets) {
      if (now > expiry) {
        this.consumedTickets.delete(ticket);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
