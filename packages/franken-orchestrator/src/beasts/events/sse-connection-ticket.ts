import { randomUUID, timingSafeEqual } from 'node:crypto';

interface TicketEntry {
  token: string;
  expiresAt: number;
}

export interface SseConnectionTicketStoreOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

export class SseConnectionTicketStore {
  private readonly tickets = new Map<string, TicketEntry>();
  private readonly ttlMs: number;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(options?: SseConnectionTicketStoreOptions) {
    this.ttlMs = options?.ttlMs ?? 30_000;
    const cleanupMs = options?.cleanupIntervalMs ?? 60_000;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
  }

  issue(token: string): string {
    const ticket = randomUUID();
    this.tickets.set(ticket, {
      token,
      expiresAt: Date.now() + this.ttlMs,
    });
    return ticket;
  }

  validate(ticket: string, operatorToken: string): boolean {
    const entry = this.tickets.get(ticket);
    if (!entry) return false;

    this.tickets.delete(ticket);

    if (Date.now() > entry.expiresAt) return false;

    // Verify the ticket was issued for this operator token
    const bufA = Buffer.from(entry.token);
    const bufB = Buffer.from(operatorToken);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
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
