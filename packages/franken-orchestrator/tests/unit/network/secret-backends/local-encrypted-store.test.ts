import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chmod, lstat, mkdtemp, readFile, readdir, rename, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalEncryptedStore } from '../../../../src/network/secret-backends/local-encrypted-store.js';
import { testCredential } from '../../../support/test-credentials.js';

const fsMocks = vi.hoisted(() => ({
  open: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  fsMocks.open.mockImplementation(actual.open);
  fsMocks.rename.mockImplementation(actual.rename);
  return { ...actual, open: fsMocks.open, rename: fsMocks.rename };
});

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');

describe('LocalEncryptedStore', () => {
  let tempDir: string;
  let store: LocalEncryptedStore;

  beforeEach(async () => {
    vi.clearAllMocks();
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
      await store.store('comms.slack.botTokenRef', TEST_SLACK_BOT_TOKEN);
      const value = await store.resolve('comms.slack.botTokenRef');
      expect(value).toBe(TEST_SLACK_BOT_TOKEN);
    });

    it('returns undefined for non-existent key', async () => {
      const value = await store.resolve('nonexistent.key');
      expect(value).toBeUndefined();
    });

    it.each(['__proto__', 'prototype', 'constructor'])(
      'does not resolve the prototype key %s as a secret',
      async (key) => {
        expect(await store.resolve(key)).toBeUndefined();
      },
    );

    it.each(['__proto__', 'prototype', 'constructor'])(
      'rejects the unsafe key %s before storing it',
      async (key) => {
        await expect(store.store(key, 'value')).rejects.toThrow(/unsafe local secret key/i);
        expect(await store.keys()).toEqual([]);
      },
    );

    it('upserts existing key', async () => {
      await store.store('key', 'value1');
      await store.store('key', 'value2');
      const value = await store.resolve('key');
      expect(value).toBe('value2');
    });

    it('preserves the previous ciphertext when the atomic replacement fails', async () => {
      await store.store('key', 'value1');
      const secretsDir = join(tempDir, '.fbeast');
      const encPath = join(secretsDir, 'secrets.enc');
      const originalCiphertext = await readFile(encPath);
      const replacementError = Object.assign(new Error('simulated rename failure'), { code: 'EIO' });
      fsMocks.rename.mockRejectedValueOnce(replacementError);

      await expect(store.store('key', 'value2')).rejects.toBe(replacementError);

      expect(await readFile(encPath)).toEqual(originalCiphertext);
      expect((await readdir(secretsDir)).filter((name) => name.includes('secrets.enc.tmp'))).toEqual([]);
      expect(await store.resolve('key')).toBe('value1');
    });

    it('fsyncs the parent directory after replacing the ciphertext', async () => {
      await store.store('key', 'value');
      const secretsDir = join(tempDir, '.fbeast');

      expect(fsMocks.open).toHaveBeenCalledWith(secretsDir, 'r');
    });

    it('preserves existing ciphertext permissions when replacing it', async () => {
      await store.store('key', 'value1');
      const encPath = join(tempDir, '.fbeast', 'secrets.enc');
      await chmod(encPath, 0o640);

      await store.store('key', 'value2');

      expect((await stat(encPath)).mode & 0o777).toBe(0o640);
    });

    it('atomically replaces the target of an existing ciphertext symlink', async () => {
      await store.store('key', 'value1');
      const encPath = join(tempDir, '.fbeast', 'secrets.enc');
      const linkedEncPath = join(tempDir, 'persisted-secrets.enc');
      await rename(encPath, linkedEncPath);
      await symlink(linkedEncPath, encPath);

      await store.store('key', 'value2');

      expect((await lstat(encPath)).isSymbolicLink()).toBe(true);
      expect(await store.resolve('key')).toBe('value2');
      expect((await stat(linkedEncPath)).isFile()).toBe(true);
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
    it('removes temporary metadata when its atomic replacement fails', async () => {
      const secretsDir = join(tempDir, '.fbeast');
      const metaPath = join(secretsDir, 'secrets.meta.json');
      const replacementError = Object.assign(new Error('simulated metadata rename failure'), {
        code: 'EIO',
      });
      fsMocks.rename.mockRejectedValueOnce(replacementError);

      await expect(store.store('key', 'value')).rejects.toBe(replacementError);

      expect(await readdir(secretsDir)).toEqual([]);
      await expect(readFile(metaPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('persists secrets encrypted on disk', async () => {
      await store.store('key', 'sensitive-value');
      const { readFile } = await import('node:fs/promises');
      const encPath = join(tempDir, '.fbeast', 'secrets.enc');
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

    it.each([
      ['a null value', null],
      ['a string', 'value'],
      ['an array', ['value']],
      ['a non-string value', { key: 42 }],
      ['the dangerous __proto__ key', JSON.parse('{"__proto__":"value"}') as unknown],
      ['the dangerous prototype key', { prototype: 'value' }],
      ['the dangerous constructor key', { constructor: 'value' }],
    ])('rejects a decrypted payload containing %s', async (_description, payload) => {
      const unsafeStore = store as unknown as {
        saveSecrets(secrets: Record<string, string>): Promise<void>;
      };
      await unsafeStore.saveSecrets(payload as Record<string, string>);

      await expect(store.resolve('key')).rejects.toThrow(/corrupt or incompatible local secrets/i);
    });
  });
});
