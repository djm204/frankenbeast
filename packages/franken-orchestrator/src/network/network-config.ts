import { z } from 'zod';

const PortSchema = z.number().int().min(1).max(65_535);

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost'
    || normalized === '::1'
    || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }
  if (!/^127(?:\.\d{1,3}){3}$/.test(normalized)) {
    return false;
  }
  return normalized.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
}

const LocalServiceHostSchema = z.string().min(1).refine(
  isLoopbackHost,
  { message: 'Managed service hosts must be loopback-only; terminate TLS in a separate reverse proxy for non-local deployments.' },
).default('127.0.0.1');

function isLocalPlaintextOrSecureUrl(value: string, secureProtocols: string[], localProtocols: string[]): boolean {
  try {
    const parsed = new URL(value);
    if (secureProtocols.includes(parsed.protocol)) {
      return true;
    }
    return localProtocols.includes(parsed.protocol) && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

const LocalHttpOrHttpsUrlSchema = z.string().url().refine(
  (value) => isLocalPlaintextOrSecureUrl(value, ['https:'], ['http:']),
  { message: 'Must use https:// unless the URL targets a loopback-only development host.' },
);

const LocalWsOrWssUrlSchema = z.string().url().refine(
  (value) => isLocalPlaintextOrSecureUrl(value, ['wss:'], ['ws:']),
  { message: 'Must use wss:// unless the URL targets a loopback-only development host.' },
);

export const NetworkModeSchema = z.enum(['secure', 'insecure']);

const LEGACY_BACKEND_MAP: Record<string, string> = {
  'macos-keychain': 'os-keychain',
  'windows-credential-manager': 'os-keychain',
  'linux-secret-service': 'os-keychain',
};

export const SecureBackendSchema = z.preprocess(
  (val) => (typeof val === 'string' ? (LEGACY_BACKEND_MAP[val] ?? val) : val),
  z.enum(['1password', 'bitwarden', 'os-keychain', 'local-encrypted']),
);

export const NetworkOperatorConfigSchema = z.object({
  mode: NetworkModeSchema.default('secure'),
  secureBackend: SecureBackendSchema.default('local-encrypted'),
  operatorTokenRef: z.string().min(1).optional(),
});

export const ChatServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: LocalServiceHostSchema,
  port: PortSchema.default(3737),
  model: z.string().min(1).default('claude-sonnet-4-6'),
});

export const BeastDaemonServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: LocalServiceHostSchema,
  port: PortSchema.default(4050),
});

export const DashboardServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: LocalServiceHostSchema,
  port: PortSchema.default(5173),
  apiUrl: LocalHttpOrHttpsUrlSchema.default('http://127.0.0.1:3737'),
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

export const TelegramChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  botTokenRef: z.string().min(1).optional(),
});

export const WhatsAppChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  accessTokenRef: z.string().min(1).optional(),
  phoneNumberIdRef: z.string().min(1).optional(),
  appSecretRef: z.string().min(1).optional(),
  verifyTokenRef: z.string().min(1).optional(),
});

export const CommsServiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: LocalServiceHostSchema,
  port: PortSchema.default(3200),
  orchestratorWsUrl: LocalWsOrWssUrlSchema.default('ws://127.0.0.1:3737/v1/chat/ws'),
  orchestratorTokenRef: z.string().min(1).optional(),
  slack: SlackChannelConfigSchema.default({}),
  discord: DiscordChannelConfigSchema.default({}),
  telegram: TelegramChannelConfigSchema.default({}),
  whatsapp: WhatsAppChannelConfigSchema.default({}),
});

export const NetworkConfigSchema = z.object({
  network: NetworkOperatorConfigSchema.default({}),
  beastsDaemon: BeastDaemonServiceConfigSchema.default({}),
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
