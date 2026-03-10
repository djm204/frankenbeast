import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionTokenStore } from '../../../../src/governor/security/session-token-store.js';
import { createSessionToken } from '../../../../src/governor/security/session-token.js';

function makeToken(ttlMs: number = 3_600_000) {
  return createSessionToken({
    approvalId: 'req-001',
    scope: 'deploy',
    grantedBy: 'human',
    ttlMs,
  });
}

describe('SessionTokenStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('store() and get() round-trip', () => {
    const store = new SessionTokenStore();
    const token = makeToken();

    store.store(token);

    expect(store.get(token.tokenId)).toEqual(token);
  });

  it('get() returns undefined for unknown tokenId', () => {
    const store = new SessionTokenStore();
    expect(store.get('unknown')).toBeUndefined();
  });

  it('get() returns undefined for expired token', () => {
    const store = new SessionTokenStore();
    const token = makeToken(1000);

    store.store(token);
    vi.advanceTimersByTime(2000);

    expect(store.get(token.tokenId)).toBeUndefined();
  });

  it('revoke() removes a token', () => {
    const store = new SessionTokenStore();
    const token = makeToken();

    store.store(token);
    store.revoke(token.tokenId);

    expect(store.get(token.tokenId)).toBeUndefined();
  });

  it('isValid() returns true before expiry', () => {
    const store = new SessionTokenStore();
    const token = makeToken(10_000);

    store.store(token);

    expect(store.isValid(token.tokenId)).toBe(true);
  });

  it('isValid() returns false after expiry', () => {
    const store = new SessionTokenStore();
    const token = makeToken(1000);

    store.store(token);
    vi.advanceTimersByTime(2000);

    expect(store.isValid(token.tokenId)).toBe(false);
  });

  it('isValid() returns false for unknown tokenId', () => {
    const store = new SessionTokenStore();
    expect(store.isValid('unknown')).toBe(false);
  });
});
