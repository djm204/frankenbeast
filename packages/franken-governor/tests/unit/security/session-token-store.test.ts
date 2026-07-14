import { mkdtempSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionToken } from '../../../src/core/types.js';
import { SessionTokenStore } from '../../../src/security/session-token-store.js';
import { createSessionToken } from '../../../src/security/session-token.js';

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

  it('sweepExpired() prunes multiple expired in-memory tokens without querying their ids', () => {
    const store = new SessionTokenStore();
    const expiredA = makeToken(1000);
    const expiredB = makeToken(1500);
    const fresh = makeToken(10_000);

    store.store(expiredA);
    store.store(expiredB);
    store.store(fresh);

    expect(store.sweepExpired({ nowMs: expiredB.expiresAt.getTime() + 1 })).toBe(2);
    expect(store.get(expiredA.tokenId)).toBeUndefined();
    expect(store.get(expiredB.tokenId)).toBeUndefined();
    expect(store.get(fresh.tokenId)).toEqual(fresh);
  });

  it('cleanupExpired() remains available as a compatibility alias', () => {
    const store = new SessionTokenStore();
    const expired = makeToken(1000);
    const fresh = makeToken(10_000);

    store.store(expired);
    vi.advanceTimersByTime(2000);
    store.store(fresh);

    expect(store.cleanupExpired()).toBe(0);
    expect(store.get(expired.tokenId)).toBeUndefined();
    expect(store.get(fresh.tokenId)).toEqual(fresh);
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

  it('treats invalid expiresAt dates as expired', () => {
    const store = new SessionTokenStore();
    const token: SessionToken = {
      ...makeToken(10_000),
      expiresAt: new Date(Number.NaN),
    };

    store.store(token);

    expect(store.get(token.tokenId)).toBeUndefined();
    expect(store.isValid(token.tokenId)).toBe(false);
  });

  it('isValid() returns false for unknown tokenId', () => {
    const store = new SessionTokenStore();
    expect(store.isValid('unknown')).toBe(false);
  });

  it('consume() returns the token once and removes it from the in-memory store', () => {
    const store = new SessionTokenStore();
    const token = makeToken(10_000);

    store.store(token);

    expect(store.consume(token.tokenId, 'deploy')).toEqual({ status: 'consumed', token });
    expect(store.consume(token.tokenId, 'deploy')).toEqual({ status: 'missing' });
    expect(store.isValid(token.tokenId, 'deploy')).toBe(false);
  });

  it('consume() preserves a valid token when the requested scope does not match', () => {
    const store = new SessionTokenStore();
    const token = makeToken(10_000);

    store.store(token);

    expect(store.consume(token.tokenId, 'other-scope')).toEqual({ status: 'scope_mismatch' });
    expect(store.isValid(token.tokenId, 'deploy')).toBe(true);
  });

  it('consume() prunes expired tokens and reports the expired state', () => {
    const store = new SessionTokenStore();
    const token = makeToken(1000);

    store.store(token);
    vi.advanceTimersByTime(2000);

    expect(store.consume(token.tokenId, 'deploy')).toEqual({ status: 'expired' });
    expect(store.consume(token.tokenId, 'deploy')).toEqual({ status: 'missing' });
  });

  it('consume() atomically allows one persisted store instance to claim a token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const issuer = new SessionTokenStore({ persistenceFile });
      const token = makeToken(10_000);
      issuer.store(token);

      const contenders = Array.from({ length: 8 }, () => new SessionTokenStore({ persistenceFile }));
      const results = await Promise.all(contenders.map((store) => Promise.resolve().then(() => store.consume(token.tokenId, 'deploy'))));

      expect(results.filter((result) => result.status === 'consumed')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'missing')).toHaveLength(7);
      expect(new SessionTokenStore({ persistenceFile }).isValid(token.tokenId, 'deploy')).toBe(false);
      expect(JSON.parse(readFileSync(persistenceFile, 'utf8'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists tokens so a new store instance can validate them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const firstStore = new SessionTokenStore({ persistenceFile });
      const token = makeToken(10_000);

      firstStore.store(token);

      const secondStore = new SessionTokenStore({ persistenceFile });
      expect(secondStore.get(token.tokenId)).toEqual(token);
      expect(secondStore.isValid(token.tokenId, 'deploy')).toBe(true);
      expect(secondStore.isValid(token.tokenId, 'other-scope')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reloads persisted tokens on access for already-running validator processes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const validatorStore = new SessionTokenStore({ persistenceFile });
      const issuingStore = new SessionTokenStore({ persistenceFile });
      const token = makeToken(10_000);

      expect(validatorStore.isValid(token.tokenId)).toBe(false);
      issuingStore.store(token);

      expect(validatorStore.get(token.tokenId)).toEqual(token);
      expect(validatorStore.isValid(token.tokenId, 'deploy')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('observes cross-process revocations before validating', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const validatorStore = new SessionTokenStore({ persistenceFile });
      const issuingStore = new SessionTokenStore({ persistenceFile });
      const token = makeToken(10_000);

      issuingStore.store(token);
      expect(validatorStore.isValid(token.tokenId)).toBe(true);

      issuingStore.revoke(token.tokenId);
      expect(validatorStore.isValid(token.tokenId)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clears cached tokens when the backing file disappears', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const validatorStore = new SessionTokenStore({ persistenceFile });
      const issuingStore = new SessionTokenStore({ persistenceFile });
      const token = makeToken(10_000);

      issuingStore.store(token);
      expect(validatorStore.isValid(token.tokenId)).toBe(true);

      unlinkSync(persistenceFile);
      expect(validatorStore.isValid(token.tokenId)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recovers stale lock files before writing persisted tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const staleLockPath = `${persistenceFile}.lock`;
      writeFileSync(staleLockPath, 'stale');
      const staleTime = new Date(Date.now() - 60_000);
      utimesSync(staleLockPath, staleTime, staleTime);

      const store = new SessionTokenStore({ persistenceFile });
      const token = makeToken(10_000);

      store.store(token);

      expect(store.isValid(token.tokenId)).toBe(true);
      expect(() => readFileSync(staleLockPath, 'utf8')).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sweepExpired() rewrites persisted stores with unqueried expired tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const store = new SessionTokenStore({ persistenceFile });
      const expired = makeToken(1000);
      const fresh = makeToken(10_000);
      store.store(expired);
      store.store(fresh);

      const beforeCleanup = JSON.parse(readFileSync(persistenceFile, 'utf8'));
      expect(beforeCleanup).toHaveLength(2);

      expect(store.sweepExpired({ nowMs: expired.expiresAt.getTime() + 1 })).toBe(1);

      const persisted = JSON.parse(readFileSync(persistenceFile, 'utf8'));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].tokenId).toBe(fresh.tokenId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
