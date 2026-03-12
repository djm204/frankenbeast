import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalEncryptedStore } from '../../../../src/network/secret-backends/local-encrypted-store.js';

describe('LocalEncryptedStore', () => {
  let tempDir: string;
  let store: LocalEncryptedStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'secret-test-'));
    store = new LocalEncryptedStore({
      projectRoot: tempDir,
      passphrase: 'test-passphrase-1234',
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('detect', () => {
    it('always reports available', async () => {
      const detection = await store.detect();
      expect(detection.available).toBe(true);
    });
  });

  describe('store and resolve', () => {
    it('stores and resolves a secret', async () => {
      await store.store('comms.slack.botTokenRef', 'xoxb-test-token');
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe('xoxb-test-token');
    });

    it('returns undefined for non-existent key', async () => {
      const value = await store.resolve('nonexistent.key');
      expect(value).toBeUndefined();
    });

    it('upserts existing key', async () => {
      await store.store('key', 'value1');
      await store.store('key', 'value2');
      const value = await store.resolve('key');
      expect(value).toBe('value2');
    });

    it('handles multiple secrets', async () => {
      await store.store('key1', 'value1');
      await store.store('key2', 'value2');
      expect(await store.resolve('key1')).toBe('value1');
      expect(await store.resolve('key2')).toBe('value2');
    });
  });

  describe('delete', () => {
    it('deletes a stored secret', async () => {
      await store.store('key', 'value');
      await store.delete('key');
      const value = await store.resolve('key');
      expect(value).toBeUndefined();
    });

    it('is a no-op for non-existent key', async () => {
      await expect(store.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('keys', () => {
    it('lists all stored keys', async () => {
      await store.store('key1', 'value1');
      await store.store('key2', 'value2');
      const allKeys = await store.keys();
      expect(allKeys).toEqual(expect.arrayContaining(['key1', 'key2']));
      expect(allKeys).toHaveLength(2);
    });

    it('returns empty array when no secrets stored', async () => {
      const allKeys = await store.keys();
      expect(allKeys).toEqual([]);
    });
  });

  describe('encryption', () => {
    it('persists secrets encrypted on disk', async () => {
      await store.store('key', 'sensitive-value');
      const { readFile } = await import('node:fs/promises');
      const encPath = join(tempDir, '.frankenbeast', 'secrets.enc');
      const raw = await readFile(encPath, 'utf-8');
      expect(raw).not.toContain('sensitive-value');
    });

    it('cannot decrypt with wrong passphrase', async () => {
      await store.store('key', 'value');
      const wrongStore = new LocalEncryptedStore({
        projectRoot: tempDir,
        passphrase: 'wrong-passphrase',
      });
      await expect(wrongStore.resolve('key')).rejects.toThrow();
    });
  });
});
