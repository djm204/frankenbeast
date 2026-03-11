import { describe, expect, it } from 'vitest';
import { SecretResolver } from '../../../src/network/secret-store.js';
import type { ISecretStore, SecretStoreDetection } from '../../../src/network/secret-store.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

function createInMemoryStore(secrets: Record<string, string>): ISecretStore {
  const data = new Map(Object.entries(secrets));
  return {
    id: 'test',
    detect: async (): Promise<SecretStoreDetection> => ({ available: true }),
    store: async (key, value) => { data.set(key, value); },
    resolve: async (key) => data.get(key),
    delete: async (key) => { data.delete(key); },
    keys: async () => [...data.keys()],
  };
}

describe('SecretResolver', () => {
  it('resolves a single secret', async () => {
    const store = createInMemoryStore({ 'comms.slack.botTokenRef': 'xoxb-test' });
    const resolver = new SecretResolver(store);
    const value = await resolver.resolve('comms.slack.botTokenRef');
    expect(value).toBe('xoxb-test');
  });

  it('returns undefined for missing optional secret', async () => {
    const store = createInMemoryStore({});
    const resolver = new SecretResolver(store);
    const value = await resolver.resolve('comms.slack.botTokenRef');
    expect(value).toBeUndefined();
  });

  it('resolves all secrets from config using config field values as lookup keys', async () => {
    const store = createInMemoryStore({
      'my-operator-key': 'op-token',
      'my-slack-bot-key': 'xoxb-test',
      'my-slack-signing-key': 'signing-test',
    });
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    // Set operatorTokenRef — may need to cast since it might not exist in schema yet
    (config.network as any).operatorTokenRef = 'my-operator-key';
    config.comms.slack.enabled = true;
    config.comms.slack.botTokenRef = 'my-slack-bot-key';
    config.comms.slack.signingSecretRef = 'my-slack-signing-key';

    const resolved = await resolver.resolveAll(config);
    expect(resolved.operatorToken).toBe('op-token');
    expect(resolved.slackBotToken).toBe('xoxb-test');
    expect(resolved.slackSigningSecret).toBe('signing-test');
  });

  it('returns undefined for disabled transport secrets', async () => {
    const store = createInMemoryStore({});
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    const resolved = await resolver.resolveAll(config);
    expect(resolved.slackBotToken).toBeUndefined();
  });
});
