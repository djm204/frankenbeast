import { z } from 'zod/v4';

export const HeartbeatConfigSchema = z.object({
  deepReviewHour: z.number().int().min(0).max(23).default(2),
  tokenSpendAlertThreshold: z.number().nonnegative().default(5.0),
  heartbeatFilePath: z.string().min(1).default('./HEARTBEAT.md'),
  maxReflectionTokens: z.number().int().positive().default(4096),
});

export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;
