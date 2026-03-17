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

  it('issues a ticket and validates it', () => {
    const ticket = store.issue('operator-token-123');
    expect(typeof ticket).toBe('string');
    expect(ticket.length).toBeGreaterThan(0);

    const result = store.validate(ticket);
    expect(result).toBe(true);
  });

  it('burns ticket on first use (single-use)', () => {
    const ticket = store.issue('operator-token-123');

    expect(store.validate(ticket)).toBe(true);
    expect(store.validate(ticket)).toBe(false); // burned
  });

  it('rejects expired tickets', async () => {
    const shortStore = new SseConnectionTicketStore({ ttlMs: 50 });
    const ticket = shortStore.issue('operator-token-123');

    await new Promise((r) => setTimeout(r, 100));

    expect(shortStore.validate(ticket)).toBe(false);
    shortStore.destroy();
  });

  it('rejects unknown tickets', () => {
    expect(store.validate('nonexistent-uuid')).toBe(false);
  });
});
