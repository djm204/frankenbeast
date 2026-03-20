import { z } from 'zod';

export const CommsConfigSchema = z.object({
  orchestrator: z.object({
    wsUrl: z.string().url(),
    token: z.string().optional(),
  }),
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
