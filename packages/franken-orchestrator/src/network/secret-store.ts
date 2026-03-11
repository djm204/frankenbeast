import type { InterviewIO } from '../planning/interview-loop.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { LocalEncryptedStore } from './secret-backends/local-encrypted-store.js';
import { OnePasswordStore } from './secret-backends/one-password-store.js';
import { BitwardenStore } from './secret-backends/bitwarden-store.js';
import { OsKeychainStore } from './secret-backends/os-keychain-store.js';
import { runCli } from './secret-backends/cli-runner.js';

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
      return createOnePasswordStore();
    case 'bitwarden':
      return createBitwardenStore();
    case 'os-keychain':
      return createOsKeychainStore();
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

function createOnePasswordStore(): ISecretStore {
  return new OnePasswordStore(runCli);
}

function createBitwardenStore(): ISecretStore {
  return new BitwardenStore(runCli);
}

function createOsKeychainStore(): ISecretStore {
  return new OsKeychainStore({ runner: runCli });
}

export interface ResolvedSecrets {
  operatorToken?: string;
  orchestratorToken?: string;
  slackBotToken?: string;
  slackSigningSecret?: string;
  discordBotToken?: string;
}

export class SecretResolver {
  constructor(private readonly store: ISecretStore) {}

  async resolve(key: string): Promise<string | undefined> {
    return this.store.resolve(key);
  }

  async resolveAll(config: OrchestratorConfig): Promise<ResolvedSecrets> {
    // Read the config field VALUE as the lookup key, not the field name.
    const operatorTokenKey = (config.network as Record<string, unknown>).operatorTokenRef as string | undefined;
    const operatorToken = operatorTokenKey
      ? await this.store.resolve(operatorTokenKey)
      : undefined;

    const orchestratorToken = config.comms.enabled && config.comms.orchestratorTokenRef
      ? await this.store.resolve(config.comms.orchestratorTokenRef)
      : undefined;

    const slackBotToken = config.comms.slack.enabled && config.comms.slack.botTokenRef
      ? await this.store.resolve(config.comms.slack.botTokenRef)
      : undefined;
    const slackSigningSecret = config.comms.slack.enabled && config.comms.slack.signingSecretRef
      ? await this.store.resolve(config.comms.slack.signingSecretRef)
      : undefined;

    const discordBotToken = config.comms.discord.enabled && config.comms.discord.botTokenRef
      ? await this.store.resolve(config.comms.discord.botTokenRef)
      : undefined;

    return {
      operatorToken,
      orchestratorToken,
      slackBotToken,
      slackSigningSecret,
      discordBotToken,
    };
  }
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
