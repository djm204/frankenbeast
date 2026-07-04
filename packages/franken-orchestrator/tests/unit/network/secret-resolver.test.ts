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
      'my-telegram-bot-key': 'telegram-token',
      'my-wa-access-key': 'wa-access-token',
      'my-wa-phone-key': 'wa-phone-number-id',
      'my-wa-app-key': 'wa-app-secret',
      'my-wa-verify-key': 'wa-verify-token',
    });
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    // Set operatorTokenRef — may need to cast since it might not exist in schema yet
    (config.network as any).operatorTokenRef = 'my-operator-key';
    config.comms.slack.enabled = true;
    config.comms.slack.botTokenRef = 'my-slack-bot-key';
    config.comms.slack.signingSecretRef = 'my-slack-signing-key';
    config.comms.telegram.enabled = true;
    config.comms.telegram.botTokenRef = 'my-telegram-bot-key';
    config.comms.whatsapp.enabled = true;
    config.comms.whatsapp.accessTokenRef = 'my-wa-access-key';
    config.comms.whatsapp.phoneNumberIdRef = 'my-wa-phone-key';
    config.comms.whatsapp.appSecretRef = 'my-wa-app-key';
    config.comms.whatsapp.verifyTokenRef = 'my-wa-verify-key';

    const resolved = await resolver.resolveAll(config);
    expect(resolved.operatorToken).toBe('op-token');
    expect(resolved.slackBotToken).toBe('xoxb-test');
    expect(resolved.slackSigningSecret).toBe('signing-test');
    expect(resolved.telegramBotToken).toBe('telegram-token');
    expect(resolved.whatsappAccessToken).toBe('wa-access-token');
    expect(resolved.whatsappPhoneNumberId).toBe('wa-phone-number-id');
    expect(resolved.whatsappAppSecret).toBe('wa-app-secret');
    expect(resolved.whatsappVerifyToken).toBe('wa-verify-token');
  });

  it('returns undefined for disabled transport secrets', async () => {
    const store = createInMemoryStore({});
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    const resolved = await resolver.resolveAll(config);
    expect(resolved.slackBotToken).toBeUndefined();
  });
});
