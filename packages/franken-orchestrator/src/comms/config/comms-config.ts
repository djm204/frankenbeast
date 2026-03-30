import { z } from 'zod';

export const CommsConfigSchema = z.object({
  orchestrator: z.object({
    /** @deprecated WebSocket bridge removed in Phase 4.5.01 — field kept optional for config compat */
    wsUrl: z.string().url().optional(),
    token: z.string().optional(),
  }).default({}),
  channels: z.object({
    slack: z.object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
      signingSecret: z.string().optional(),
    }).optional(),
    discord: z.object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
      publicKey: z.string().optional(),
    }).optional(),
    telegram: z.object({
      enabled: z.boolean().default(false),
      botToken: z.string().optional(),
    }).optional(),
    whatsapp: z.object({
      enabled: z.boolean().default(false),
      accessToken: z.string().optional(),
      phoneNumberId: z.string().optional(),
      appSecret: z.string().optional(),
      verifyToken: z.string().optional(),
    }).optional(),
  }),
  security: z.object({
    rateLimit: z.object({
      windowMs: z.number().default(60000), // 1 minute
      max: z.number().default(100), // 100 requests per window
    }).optional(),
  }).optional(),
});

export type CommsConfig = z.infer<typeof CommsConfigSchema>;

// ── Config merging (moved from server/start-comms-server.ts) ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(...layers: Array<Partial<T> | undefined>): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      const existing = result[key];
      if (isRecord(existing) && isRecord(value)) {
        result[key] = deepMerge(existing, value);
      } else {
        result[key] = value;
      }
    }
  }
  return result as Partial<T>;
}

export function resolveCommsServerConfig(
  config: CommsConfig,
  overrideConfig?: Partial<CommsConfig>,
): CommsConfig {
  return CommsConfigSchema.parse(deepMerge<CommsConfig>(config, overrideConfig));
}
