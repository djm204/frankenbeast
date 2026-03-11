import type { InterviewIO } from '../planning/interview-loop.js';
import { LocalEncryptedStore } from './secret-backends/local-encrypted-store.js';

export interface SecretStoreDetection {
  available: boolean;
  reason?: string;
  setupInstructions?: string;
}

export interface ISecretStore {
  readonly id: string;
  detect(): Promise<SecretStoreDetection>;
  /** Upsert: creates if new, updates if exists. */
  store(key: string, value: string): Promise<void>;
  resolve(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface SecretStoreOptions {
  projectRoot: string;
  io?: InterviewIO;
  passphrase?: string;
}

export function createSecretStore(
  backendId: string,
  options: SecretStoreOptions,
): ISecretStore {
  switch (backendId) {
    case 'local-encrypted':
      return createLocalEncryptedStore(options);
    case '1password':
      return createStubStore('1password');
    case 'bitwarden':
      return createStubStore('bitwarden');
    case 'os-keychain':
      return createStubStore('os-keychain');
    default:
      throw new Error(`Unknown secret backend: ${backendId}`);
  }
}

function createLocalEncryptedStore(options: SecretStoreOptions): ISecretStore {
  const passphrase = options.passphrase ?? process.env.FRANKENBEAST_PASSPHRASE;
  if (!passphrase) {
    throw new Error(
      'Local encrypted store requires a passphrase. Set FRANKENBEAST_PASSPHRASE env var or pass via options.',
    );
  }
  return new LocalEncryptedStore({ ...options, passphrase });
}

function createStubStore(id: string): ISecretStore {
  return {
    id,
    detect: async () => ({ available: false, reason: 'Not yet implemented' }),
    store: async () => { throw new Error(`${id} store not yet implemented`); },
    resolve: async () => { throw new Error(`${id} resolve not yet implemented`); },
    delete: async () => { throw new Error(`${id} delete not yet implemented`); },
    keys: async () => { throw new Error(`${id} keys not yet implemented`); },
  };
}
