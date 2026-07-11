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

  it('cleanupExpired() prunes expired in-memory tokens that were never queried', () => {
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

  it('prunes unqueried expired persisted tokens on the next write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'governor-session-token-store-'));
    const persistenceFile = join(dir, 'tokens.json');
    try {
      const store = new SessionTokenStore({ persistenceFile });
      const token = makeToken(1000);
      store.store(token);

      vi.advanceTimersByTime(2000);

      const beforeWrite = JSON.parse(readFileSync(persistenceFile, 'utf8'));
      expect(beforeWrite).toHaveLength(1);

      const fresh = makeToken(10_000);
      store.store(fresh);

      const persisted = JSON.parse(readFileSync(persistenceFile, 'utf8'));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].tokenId).toBe(fresh.tokenId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
