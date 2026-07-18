import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('keeps an issued ticket valid after the issuing process store is recreated', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sse-ticket-store-'));
    const databasePath = join(dir, 'beast.db');
    const issuingStore = new SseConnectionTicketStore({ databasePath });

    try {
      const ticket = issuingStore.issue('operator-token-123');
      issuingStore.destroy();

      const restartedStore = new SseConnectionTicketStore({ databasePath });
      try {
        expect(restartedStore.consume(ticket, 'operator-token-123')).toBe('valid');
      } finally {
        restartedStore.destroy();
      }
    } finally {
      issuingStore.destroy();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shares single-use ticket state across store instances', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sse-ticket-store-'));
    const databasePath = join(dir, 'beast.db');
    const firstStore = new SseConnectionTicketStore({ databasePath });
    const secondStore = new SseConnectionTicketStore({ databasePath });

    try {
      const ticket = firstStore.issue('operator-token-123');
      expect(secondStore.consume(ticket, 'operator-token-123')).toBe('valid');
      expect(firstStore.consume(ticket, 'operator-token-123')).toBe('reused');
    } finally {
      firstStore.destroy();
      secondStore.destroy();
      await rm(dir, { recursive: true, force: true });
    }
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

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects invalid ticket ttlMs value %s',
    (ttlMs) => {
      expect(() => new SseConnectionTicketStore({ ttlMs })).toThrow(
        /ttlMs must be a finite positive integer number of milliseconds/,
      );
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects invalid cleanupIntervalMs value %s before scheduling cleanup',
    (cleanupIntervalMs) => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      try {
        expect(() => new SseConnectionTicketStore({ cleanupIntervalMs })).toThrow(
          /cleanupIntervalMs must be a finite positive integer number of milliseconds/,
        );
        expect(setIntervalSpy).not.toHaveBeenCalled();
      } finally {
        setIntervalSpy.mockRestore();
      }
    },
  );

  it('rejects cleanupIntervalMs values above Node timer delay limits before scheduling cleanup', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    try {
      expect(() => new SseConnectionTicketStore({ cleanupIntervalMs: 2_147_483_648 })).toThrow(
        /cleanupIntervalMs must be at most 2147483647 milliseconds/,
      );
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('contains periodic cleanup failures and reports them without crashing the daemon', () => {
    vi.useFakeTimers();
    const onCleanupError = vi.fn();
    const cleanupStore = new SseConnectionTicketStore({
      cleanupIntervalMs: 10,
      onCleanupError,
    });
    const failure = new Error('database is busy');
    const cleanupSpy = vi
      .spyOn(cleanupStore as unknown as { cleanup(): void }, 'cleanup')
      .mockImplementationOnce(() => {
        throw failure;
      });

    try {
      expect(() => vi.advanceTimersByTime(10)).not.toThrow();
      expect(cleanupSpy).toHaveBeenCalledOnce();
      expect(onCleanupError).toHaveBeenCalledWith(failure);
    } finally {
      cleanupStore.destroy();
      vi.useRealTimers();
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects invalid consumedRetentionMs value %s',
    (consumedRetentionMs) => {
      expect(() => new SseConnectionTicketStore({ consumedRetentionMs })).toThrow(
        /consumedRetentionMs must be a finite positive integer number of milliseconds/,
      );
    },
  );

  it('rejects unknown tickets', () => {
    expect(store.validate('nonexistent-uuid', 'operator-token-123')).toBe(false);
  });

  it('rejects ticket when operator token does not match', () => {
    const ticket = store.issue('operator-token-123');
    expect(store.validate(ticket, 'different-token')).toBe(false);
  });
});
