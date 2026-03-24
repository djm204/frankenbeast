import { describe, it, expect } from 'vitest';
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

describe('resolveCommsSecrets', () => {
  it('resolves slack secrets from env', () => {
    const config = CommsRunConfigSchema.parse({
      channels: { slack: { enabled: true } },
    });
    const secrets = resolveCommsSecrets(config, {
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_SIGNING_SECRET: 'sig-secret',
    });
    expect(secrets.slack).toEqual({ token: 'xoxb-test', signingSecret: 'sig-secret' });
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
    const secrets = resolveCommsSecrets(config, { MY_TG_TOKEN: 'tg-123' });
    expect(secrets.telegram).toEqual({ botToken: 'tg-123' });
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
