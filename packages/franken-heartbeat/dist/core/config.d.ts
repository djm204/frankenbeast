import { z } from 'zod/v4';
export declare const HeartbeatConfigSchema: z.ZodObject<{
    deepReviewHour: z.ZodDefault<z.ZodNumber>;
    tokenSpendAlertThreshold: z.ZodDefault<z.ZodNumber>;
    heartbeatFilePath: z.ZodDefault<z.ZodString>;
    maxReflectionTokens: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;
//# sourceMappingURL=config.d.ts.map