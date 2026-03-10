import { z } from 'zod';

const HostSchema = z.string().min(1).default('127.0.0.1');
const PortSchema = z.number().int().min(1).max(65_535);

export const NetworkModeSchema = z.enum(['secure', 'insecure']);
export const SecureBackendSchema = z.enum([
  '1password',
  'bitwarden',
  'macos-keychain',
  'windows-credential-manager',
  'linux-secret-service',
  'local-encrypted',
]);

export const NetworkOperatorConfigSchema = z.object({
  mode: NetworkModeSchema.default('secure'),
  secureBackend: SecureBackendSchema.default('local-encrypted'),
});

export const ChatServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: HostSchema,
  port: PortSchema.default(3737),
  model: z.string().min(1).default('claude-sonnet-4-6'),
});

export const DashboardServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: HostSchema,
  port: PortSchema.default(5173),
  apiUrl: z.string().url().default('http://127.0.0.1:3737'),
});

export const SlackChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().min(1).optional(),
  botTokenRef: z.string().min(1).optional(),
  signingSecretRef: z.string().min(1).optional(),
});

export const DiscordChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  applicationId: z.string().min(1).optional(),
  botTokenRef: z.string().min(1).optional(),
  publicKeyRef: z.string().min(1).optional(),
});

export const CommsServiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: HostSchema,
  port: PortSchema.default(3200),
  orchestratorWsUrl: z.string().url().default('ws://127.0.0.1:3737/v1/chat/ws'),
  orchestratorTokenRef: z.string().min(1).optional(),
  slack: SlackChannelConfigSchema.default({}),
  discord: DiscordChannelConfigSchema.default({}),
});

export const NetworkConfigSchema = z.object({
  network: NetworkOperatorConfigSchema.default({}),
  chat: ChatServiceConfigSchema.default({}),
  dashboard: DashboardServiceConfigSchema.default({}),
  comms: CommsServiceConfigSchema.default({}),
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type NetworkMode = z.infer<typeof NetworkModeSchema>;
export type SecureBackend = z.infer<typeof SecureBackendSchema>;

export function defaultNetworkConfig(): NetworkConfig {
  return NetworkConfigSchema.parse({});
}
