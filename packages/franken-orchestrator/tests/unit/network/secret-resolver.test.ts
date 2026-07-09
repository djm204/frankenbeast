import { describe, expect, it } from 'vitest';
import { SecretResolver } from '../../../src/network/secret-store.js';
import type { ISecretStore, SecretStoreDetection } from '../../../src/network/secret-store.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');
const TEST_SLACK_SIGNING_SECRET = testCredential('TEST_SLACK_SIGNING_SECRET');
const TEST_TELEGRAM_BOT_TOKEN = testCredential('TEST_TELEGRAM_BOT_TOKEN');
const TEST_WHATSAPP_ACCESS_TOKEN = testCredential('TEST_WHATSAPP_ACCESS_TOKEN');
const TEST_WHATSAPP_APP_SECRET = testCredential('TEST_WHATSAPP_APP_SECRET');
const TEST_WHATSAPP_VERIFY_TOKEN = testCredential('TEST_WHATSAPP_VERIFY_TOKEN');
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
    const store = createInMemoryStore({ 'comms.slack.botTokenRef': TEST_SLACK_BOT_TOKEN });
    const resolver = new SecretResolver(store);
    const value = await resolver.resolve('comms.slack.botTokenRef');
    expect(value).toBe(TEST_SLACK_BOT_TOKEN);
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
      'my-slack-bot-key': TEST_SLACK_BOT_TOKEN,
      'my-slack-signing-key': TEST_SLACK_SIGNING_SECRET,
      'my-telegram-bot-key': TEST_TELEGRAM_BOT_TOKEN,
      'my-wa-access-key': TEST_WHATSAPP_ACCESS_TOKEN,
      'my-wa-app-key': TEST_WHATSAPP_APP_SECRET,
      'my-wa-verify-key': TEST_WHATSAPP_VERIFY_TOKEN,
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
    config.comms.whatsapp.phoneNumberIdRef = 'wa-phone-number-id';
    config.comms.whatsapp.appSecretRef = 'my-wa-app-key';
    config.comms.whatsapp.verifyTokenRef = 'my-wa-verify-key';

    const resolved = await resolver.resolveAll(config);
    expect(resolved.operatorToken).toBe('op-token');
    expect(resolved.slackBotToken).toBe(TEST_SLACK_BOT_TOKEN);
    expect(resolved.slackSigningSecret).toBe(TEST_SLACK_SIGNING_SECRET);
    expect(resolved.telegramBotToken).toBe(TEST_TELEGRAM_BOT_TOKEN);
    expect(resolved.whatsappAccessToken).toBe(TEST_WHATSAPP_ACCESS_TOKEN);
    expect(resolved.whatsappPhoneNumberId).toBe('wa-phone-number-id');
    expect(resolved.whatsappAppSecret).toBe(TEST_WHATSAPP_APP_SECRET);
    expect(resolved.whatsappVerifyToken).toBe(TEST_WHATSAPP_VERIFY_TOKEN);
  });

  it('returns undefined for disabled transport secrets', async () => {
    const store = createInMemoryStore({});
    const resolver = new SecretResolver(store);
    const config = defaultConfig();
    const resolved = await resolver.resolveAll(config);
    expect(resolved.slackBotToken).toBeUndefined();
  });
});
