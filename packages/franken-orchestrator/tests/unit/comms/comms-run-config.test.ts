import { describe, it, expect } from 'vitest';
import { testCredential } from '../../support/test-credentials.js';
import {
  CommsRunConfigSchema,
  resolveCommsSecrets,
  type CommsRunConfig,
} from '../../../src/comms/config/comms-run-config.js';

describe('CommsRunConfigSchema', () => {
  it('defaults to comms disabled with all channels disabled', () => {
    const config = CommsRunConfigSchema.parse({});
    expect(config.enabled).toBe(false);
    expect(config.channels.slack.enabled).toBe(false);
    expect(config.channels.discord.enabled).toBe(false);
    expect(config.channels.telegram.enabled).toBe(false);
    expect(config.channels.whatsapp.enabled).toBe(false);
  });

  it('parses full config with overrides', () => {
    const config = CommsRunConfigSchema.parse({
      enabled: true,
      host: '0.0.0.0',
      port: 3201,
      channels: {
        slack: { enabled: true },
        telegram: { enabled: true, botTokenRef: 'MY_TG_TOKEN' },
      },
    });
    expect(config.enabled).toBe(true);
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3201);
    expect(config.channels.slack.enabled).toBe(true);
    expect(config.channels.telegram.botTokenRef).toBe('MY_TG_TOKEN');
    expect(config.channels.discord.enabled).toBe(false);
  });

  it('defaults secretRef fields', () => {
    const config = CommsRunConfigSchema.parse({});
    expect(config.channels.slack.tokenRef).toBe('SLACK_BOT_TOKEN');
    expect(config.channels.slack.signingSecretRef).toBe('SLACK_SIGNING_SECRET');
    expect(config.channels.discord.publicKeyRef).toBe('DISCORD_PUBLIC_KEY');
  });
});

const TEST_SLACK_BOT_TOKEN = testCredential('TEST_SLACK_BOT_TOKEN');
const TEST_SLACK_SIGNING_SECRET = testCredential('TEST_SLACK_SIGNING_SECRET');
const TEST_DISCORD_BOT_TOKEN = testCredential('TEST_DISCORD_BOT_TOKEN');
const TEST_TELEGRAM_BOT_TOKEN = testCredential('TEST_TELEGRAM_BOT_TOKEN');

describe('resolveCommsSecrets', () => {
  it('resolves slack secrets from env', () => {
    const config = CommsRunConfigSchema.parse({
      channels: { slack: { enabled: true } },
    });
    const secrets = resolveCommsSecrets(config, {
      SLACK_BOT_TOKEN: TEST_SLACK_BOT_TOKEN,
      SLACK_SIGNING_SECRET: TEST_SLACK_SIGNING_SECRET,
    });
    expect(secrets.slack).toEqual({ token: TEST_SLACK_BOT_TOKEN, signingSecret: TEST_SLACK_SIGNING_SECRET });
  });

  it('throws when required secret is missing', () => {
    const config = CommsRunConfigSchema.parse({
      channels: { slack: { enabled: true } },
    });
    expect(() => resolveCommsSecrets(config, {})).toThrow('SLACK_BOT_TOKEN not found in environment');
  });

  it('resolves custom ref names', () => {
    const config = CommsRunConfigSchema.parse({
      channels: { telegram: { enabled: true, botTokenRef: 'MY_TG_TOKEN' } },
    });
    const secrets = resolveCommsSecrets(config, { MY_TG_TOKEN: TEST_TELEGRAM_BOT_TOKEN });
    expect(secrets.telegram).toEqual({ botToken: TEST_TELEGRAM_BOT_TOKEN });
  });

  it('preserves literal Discord public keys when no env value exists', () => {
    const publicKey = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';
    const config = CommsRunConfigSchema.parse({
      channels: { discord: { enabled: true, publicKeyRef: publicKey } },
    });
    const secrets = resolveCommsSecrets(config, { DISCORD_BOT_TOKEN: TEST_DISCORD_BOT_TOKEN });

    expect(secrets.discord).toEqual({ token: TEST_DISCORD_BOT_TOKEN, publicKey });
  });

  it('rejects unresolved Discord public key ref names', () => {
    const config = CommsRunConfigSchema.parse({
      channels: { discord: { enabled: true, publicKeyRef: 'DISCORD_PUBLIC_KEY' } },
    });

    expect(() => resolveCommsSecrets(config, { DISCORD_BOT_TOKEN: TEST_DISCORD_BOT_TOKEN }))
      .toThrow('DISCORD_PUBLIC_KEY not found in environment');
  });

  it('skips disabled channels', () => {
    const config = CommsRunConfigSchema.parse({});
    const secrets = resolveCommsSecrets(config, {});
    expect(secrets.slack).toBeUndefined();
    expect(secrets.discord).toBeUndefined();
    expect(secrets.telegram).toBeUndefined();
    expect(secrets.whatsapp).toBeUndefined();
  });

  it('resolves all whatsapp secrets', () => {
    const config = CommsRunConfigSchema.parse({
      channels: { whatsapp: { enabled: true } },
    });
    const secrets = resolveCommsSecrets(config, {
      WHATSAPP_ACCESS_TOKEN: 'wa-tok',
      WHATSAPP_PHONE_NUMBER_ID: 'wa-phone',
      WHATSAPP_APP_SECRET: 'wa-sec',
      WHATSAPP_VERIFY_TOKEN: 'wa-ver',
    });
    expect(secrets.whatsapp).toEqual({
      accessToken: 'wa-tok',
      phoneNumberId: 'wa-phone',
      appSecret: 'wa-sec',
      verifyToken: 'wa-ver',
    });
  });
});
