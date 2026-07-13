import { z } from 'zod';

const HostSchema = z.string().min(1).default('127.0.0.1');
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

function requireLoopbackServiceHost(ctx: z.RefinementCtx, host: string): void {
  if (!isLoopbackHost(host)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['host'],
      message: 'Managed service hosts must be loopback-only; terminate TLS in a separate reverse proxy for non-local deployments.',
    });
  }
}

function requireLocalPlaintextOrSecureUrl(
  ctx: z.RefinementCtx,
  path: string,
  value: string,
  secureProtocols: string[],
  localProtocols: string[],
  message: string,
): void {
  if (!isLocalPlaintextOrSecureUrl(value, secureProtocols, localProtocols)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  }
}

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

const DASHBOARD_API_URL_DEFAULT = 'http://127.0.0.1:3737';

const UrlSchema = z.string().url();

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
  host: HostSchema,
  port: PortSchema.default(3737),
  model: z.string().min(1).default('claude-sonnet-4-6'),
}).superRefine((value, ctx) => {
  if (value.enabled) requireLoopbackServiceHost(ctx, value.host);
});

export const BeastDaemonServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: HostSchema,
  port: PortSchema.default(4050),
}).superRefine((value, ctx) => {
  if (value.enabled) requireLoopbackServiceHost(ctx, value.host);
});

export const DashboardServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  host: HostSchema,
  port: PortSchema.default(5173),
  apiUrl: UrlSchema.default(DASHBOARD_API_URL_DEFAULT),
}).superRefine((value, ctx) => {
  if (!value.enabled) return;
  requireLoopbackServiceHost(ctx, value.host);
  requireLocalPlaintextOrSecureUrl(
    ctx,
    'apiUrl',
    value.apiUrl,
    ['https:'],
    ['http:'],
    'Must use https:// unless the URL targets a loopback-only development host.',
  );
});

export const SlackChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  appId: z.string().min(1).optional(),
  botTokenRef: z.string().min(1).optional(),
  signingSecretRef: z.string().min(1).optional(),
  allowSensitiveDelivery: z.boolean().default(false),
});

export const DiscordChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  applicationId: z.string().min(1).optional(),
  botTokenRef: z.string().min(1).optional(),
  publicKeyRef: z.string().min(1).optional(),
  allowSensitiveDelivery: z.boolean().default(false),
});

export const TelegramChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  botTokenRef: z.string().min(1).optional(),
  webhookSecretTokenRef: z.string().min(1).optional(),
  allowSensitiveDelivery: z.boolean().default(false),
});

export const WhatsAppChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  accessTokenRef: z.string().min(1).optional(),
  phoneNumberIdRef: z.string().min(1).optional(),
  appSecretRef: z.string().min(1).optional(),
  verifyTokenRef: z.string().min(1).optional(),
  allowSensitiveDelivery: z.boolean().default(false),
});

export const CommsServiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: HostSchema,
  port: PortSchema.default(3200),
  orchestratorWsUrl: UrlSchema.default('ws://127.0.0.1:3737/v1/chat/ws'),
  orchestratorTokenRef: z.string().min(1).optional(),
  slack: SlackChannelConfigSchema.default({}),
  discord: DiscordChannelConfigSchema.default({}),
  telegram: TelegramChannelConfigSchema.default({}),
  whatsapp: WhatsAppChannelConfigSchema.default({}),
}).superRefine((value, ctx) => {
  if (!value.enabled) return;
  requireLoopbackServiceHost(ctx, value.host);
  requireLocalPlaintextOrSecureUrl(
    ctx,
    'orchestratorWsUrl',
    value.orchestratorWsUrl,
    ['wss:'],
    ['ws:'],
    'Must use wss:// unless the URL targets a loopback-only development host.',
  );
});

function hasEnabledCommsChannel(comms: z.infer<typeof CommsServiceConfigSchema>): boolean {
  return comms.slack.enabled
    || comms.discord.enabled
    || comms.telegram.enabled
    || comms.whatsapp.enabled;
}

const loopbackOnlyMessage = 'Managed service hosts must be loopback-only; terminate TLS in a separate reverse proxy for non-local deployments.';

export const NetworkConfigFieldsSchema = z.object({
  network: NetworkOperatorConfigSchema.default({}),
  beastsDaemon: BeastDaemonServiceConfigSchema.default({}),
  chat: ChatServiceConfigSchema.default({}),
  dashboard: DashboardServiceConfigSchema.default({}),
  comms: CommsServiceConfigSchema.default({}),
});

export function validateNetworkConfig(value: z.infer<typeof NetworkConfigFieldsSchema>, ctx: z.RefinementCtx): void {
  const commsActive = value.comms.enabled || hasEnabledCommsChannel(value.comms);
  const dashboardActive = value.dashboard.enabled;
  const chatActive = value.chat.enabled || dashboardActive || commsActive;
  const beastsDaemonActive = value.beastsDaemon.enabled || chatActive;

  if (beastsDaemonActive && !isLoopbackHost(value.beastsDaemon.host)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['beastsDaemon', 'host'], message: loopbackOnlyMessage });
  }
  if (chatActive && !isLoopbackHost(value.chat.host)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chat', 'host'], message: loopbackOnlyMessage });
  }
  if (dashboardActive) {
    if (!isLoopbackHost(value.dashboard.host)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dashboard', 'host'], message: loopbackOnlyMessage });
    }
    requireLocalPlaintextOrSecureUrl(
      ctx,
      'dashboard.apiUrl',
      value.dashboard.apiUrl,
      ['https:'],
      ['http:'],
      'Must use https:// unless the URL targets a loopback-only development host.',
    );
  }
  if (commsActive) {
    if (!isLoopbackHost(value.comms.host)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['comms', 'host'], message: loopbackOnlyMessage });
    }
    requireLocalPlaintextOrSecureUrl(
      ctx,
      'comms.orchestratorWsUrl',
      value.comms.orchestratorWsUrl,
      ['wss:'],
      ['ws:'],
      'Must use wss:// unless the URL targets a loopback-only development host.',
    );
  }
}

export const NetworkConfigSchema = NetworkConfigFieldsSchema.superRefine(validateNetworkConfig);

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type NetworkMode = z.infer<typeof NetworkModeSchema>;
export type SecureBackend = z.infer<typeof SecureBackendSchema>;

export function defaultNetworkConfig(): NetworkConfig {
  return NetworkConfigSchema.parse({});
}
