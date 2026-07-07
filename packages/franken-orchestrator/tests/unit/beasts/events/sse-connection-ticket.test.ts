import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SseConnectionTicketStore } from '../../../../src/beasts/events/sse-connection-ticket.js';

describe('SseConnectionTicketStore', () => {
  let store: SseConnectionTicketStore;

  beforeEach(() => {
    store = new SseConnectionTicketStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it('issues a ticket and validates it with matching operator token', () => {
    const ticket = store.issue('operator-token-123');
    expect(typeof ticket).toBe('string');
    expect(ticket.length).toBeGreaterThan(0);

    const result = store.validate(ticket, 'operator-token-123');
    expect(result).toBe(true);
  });

  it('burns ticket on first use (single-use)', () => {
    const ticket = store.issue('operator-token-123');

    expect(store.validate(ticket, 'operator-token-123')).toBe(true);
    expect(store.validate(ticket, 'operator-token-123')).toBe(false); // burned
  });

  it('marks a validly used ticket as reused on second request', () => {
    const ticket = store.issue('operator-token-123');

    expect(store.consume(ticket, 'operator-token-123')).toBe('valid');
    expect(store.consume(ticket, 'operator-token-123')).toBe('reused');
  });

  it('still reports reused after the issue TTL elapses (long-lived stream reconnect)', async () => {
    // ttl=30ms for issuance, but the consumed marker is retained much longer,
    // so a reconnect well past ttl is recognized as reused (→204), not invalid.
    const s = new SseConnectionTicketStore({ ttlMs: 30 });
    const ticket = s.issue('op');
    expect(s.consume(ticket, 'op')).toBe('valid');
    await new Promise((r) => setTimeout(r, 60));
    expect(s.consume(ticket, 'op')).toBe('reused');
    s.destroy();
  });

  it('forgets a consumed ticket once the retention window elapses (bounded memory)', async () => {
    // With a tiny retention, a reconnect after the window reads as invalid,
    // proving consumedTickets does not grow without limit.
    const s = new SseConnectionTicketStore({ ttlMs: 5, consumedRetentionMs: 30 });
    const ticket = s.issue('op');
    expect(s.consume(ticket, 'op')).toBe('valid');
    expect(s.consume(ticket, 'op')).toBe('reused');
    await new Promise((r) => setTimeout(r, 60));
    expect(s.consume(ticket, 'op')).toBe('invalid');
    s.destroy();
  });

  it('rejects expired tickets', async () => {
    const shortStore = new SseConnectionTicketStore({ ttlMs: 50 });
    const ticket = shortStore.issue('operator-token-123');

    await new Promise((r) => setTimeout(r, 100));

    expect(shortStore.validate(ticket, 'operator-token-123')).toBe(false);
    shortStore.destroy();
  });

  it('rejects unknown tickets', () => {
    expect(store.validate('nonexistent-uuid', 'operator-token-123')).toBe(false);
  });

  it('rejects ticket when operator token does not match', () => {
    const ticket = store.issue('operator-token-123');
    expect(store.validate(ticket, 'different-token')).toBe(false);
  });
});
