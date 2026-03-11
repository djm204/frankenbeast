import { describe, expect, it } from 'vitest';
import { createSecretStore } from '../../../src/network/secret-store.js';

describe('SecretStoreFactory', () => {
  it('creates a local-encrypted store', () => {
    const store = createSecretStore('local-encrypted', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('local-encrypted');
  });

  it('creates a 1password store', () => {
    const store = createSecretStore('1password', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('1password');
  });

  it('creates a bitwarden store', () => {
    const store = createSecretStore('bitwarden', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('bitwarden');
  });

  it('creates an os-keychain store', () => {
    const store = createSecretStore('os-keychain', {
      projectRoot: '/tmp/test-project',
    });
    expect(store.id).toBe('os-keychain');
  });

  it('throws for unknown backend', () => {
    expect(() => createSecretStore('unknown' as any, {
      projectRoot: '/tmp/test-project',
    })).toThrow('Unknown secret backend: unknown');
  });
});
