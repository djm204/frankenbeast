import { randomUUID, timingSafeEqual } from 'node:crypto';

interface TicketEntry {
  token: string;
  scope?: string | undefined;
  expiresAt: number;
}


export interface SseConnectionTicketStoreOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

export type SseTicketStatus = 'valid' | 'invalid' | 'reused';

export class SseConnectionTicketStore {
  private readonly tickets = new Map<string, TicketEntry>();
  private readonly consumedTickets = new Set<string>();
  private readonly ttlMs: number;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(options?: SseConnectionTicketStoreOptions) {
    this.ttlMs = options?.ttlMs ?? 30_000;
    const cleanupMs = options?.cleanupIntervalMs ?? 60_000;
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
      const consumed = this.consumedTickets.has(ticket);
      if (consumed) {
        return 'reused';
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

    const bufA = Buffer.from(entry.token);
    const bufB = Buffer.from(operatorToken);
    if (bufA.length !== bufB.length) {
      return 'invalid';
    }

    if (!timingSafeEqual(bufA, bufB)) {
      return 'invalid';
    }

    this.consumedTickets.add(ticket);
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
    
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
