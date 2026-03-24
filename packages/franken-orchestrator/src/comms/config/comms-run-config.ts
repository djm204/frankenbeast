import { z } from 'zod';

export const CommsChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  webhookPath: z.string().optional(),
  secretRef: z.string().optional(),
});

export const CommsRunConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(3200),
  channels: z
    .object({
      slack: CommsChannelConfigSchema.extend({
        tokenRef: z.string().default('SLACK_BOT_TOKEN'),
        signingSecretRef: z.string().default('SLACK_SIGNING_SECRET'),
      }).default({}),
      discord: CommsChannelConfigSchema.extend({
        tokenRef: z.string().default('DISCORD_BOT_TOKEN'),
        publicKeyRef: z.string().default('DISCORD_PUBLIC_KEY'),
      }).default({}),
      telegram: CommsChannelConfigSchema.extend({
        botTokenRef: z.string().default('TELEGRAM_BOT_TOKEN'),
      }).default({}),
      whatsapp: CommsChannelConfigSchema.extend({
        accessTokenRef: z.string().default('WHATSAPP_ACCESS_TOKEN'),
        phoneNumberIdRef: z.string().default('WHATSAPP_PHONE_NUMBER_ID'),
        appSecretRef: z.string().default('WHATSAPP_APP_SECRET'),
        verifyTokenRef: z.string().default('WHATSAPP_VERIFY_TOKEN'),
      }).default({}),
    })
    .default({}),
});

export type CommsRunConfig = z.infer<typeof CommsRunConfigSchema>;

export interface ResolvedCommsSecrets {
  slack?: { token: string; signingSecret: string };
  discord?: { token: string; publicKey: string };
  telegram?: { botToken: string };
  whatsapp?: {
    accessToken: string;
    phoneNumberId: string;
    appSecret: string;
    verifyToken: string;
  };
}

/**
 * Resolve *Ref fields to actual values from an env map.
 * Throws if a required secret is missing for an enabled channel.
 */
export function resolveCommsSecrets(
  config: CommsRunConfig,
  env: Record<string, string | undefined>,
): ResolvedCommsSecrets {
  const secrets: ResolvedCommsSecrets = {};

  if (config.channels.slack.enabled) {
    const token = env[config.channels.slack.tokenRef];
    const signingSecret = env[config.channels.slack.signingSecretRef];
    if (!token) throw new Error(`${config.channels.slack.tokenRef} not found in environment`);
    if (!signingSecret) throw new Error(`${config.channels.slack.signingSecretRef} not found in environment`);
    secrets.slack = { token, signingSecret };
  }

  if (config.channels.discord.enabled) {
    const token = env[config.channels.discord.tokenRef];
    const publicKey = env[config.channels.discord.publicKeyRef];
    if (!token) throw new Error(`${config.channels.discord.tokenRef} not found in environment`);
    if (!publicKey) throw new Error(`${config.channels.discord.publicKeyRef} not found in environment`);
    secrets.discord = { token, publicKey };
  }

  if (config.channels.telegram.enabled) {
    const botToken = env[config.channels.telegram.botTokenRef];
    if (!botToken) throw new Error(`${config.channels.telegram.botTokenRef} not found in environment`);
    secrets.telegram = { botToken };
  }

  if (config.channels.whatsapp.enabled) {
    const accessToken = env[config.channels.whatsapp.accessTokenRef];
    const phoneNumberId = env[config.channels.whatsapp.phoneNumberIdRef];
    const appSecret = env[config.channels.whatsapp.appSecretRef];
    const verifyToken = env[config.channels.whatsapp.verifyTokenRef];
    if (!accessToken) throw new Error(`${config.channels.whatsapp.accessTokenRef} not found in environment`);
    if (!phoneNumberId) throw new Error(`${config.channels.whatsapp.phoneNumberIdRef} not found in environment`);
    if (!appSecret) throw new Error(`${config.channels.whatsapp.appSecretRef} not found in environment`);
    if (!verifyToken) throw new Error(`${config.channels.whatsapp.verifyTokenRef} not found in environment`);
    secrets.whatsapp = { accessToken, phoneNumberId, appSecret, verifyToken };
  }

  return secrets;
}
