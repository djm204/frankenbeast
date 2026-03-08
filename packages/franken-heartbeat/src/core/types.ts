import { z } from 'zod/v4';

// --- Flag ---

export const FlagSeveritySchema = z.enum(['low', 'medium', 'high']);
export type FlagSeverity = z.infer<typeof FlagSeveritySchema>;

export const FlagSchema = z.object({
  source: z.string(),
  description: z.string(),
  severity: FlagSeveritySchema,
});
export type Flag = z.infer<typeof FlagSchema>;

// --- PulseResult ---

const HeartbeatOkSchema = z.object({ status: z.literal('HEARTBEAT_OK') });
const FlagsFoundSchema = z.object({
  status: z.literal('FLAGS_FOUND'),
  flags: z.array(FlagSchema),
});

export const PulseResultSchema = z.union([HeartbeatOkSchema, FlagsFoundSchema]);
export type PulseResult =
  | { status: 'HEARTBEAT_OK' }
  | { status: 'FLAGS_FOUND'; flags: Flag[] };

// --- Improvement ---

export const ImprovementSchema = z.object({
  target: z.string(),
  description: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
});
export type Improvement = z.infer<typeof ImprovementSchema>;

// --- TechDebtItem ---

export const TechDebtItemSchema = z.object({
  location: z.string(),
  description: z.string(),
  effort: z.enum(['small', 'medium', 'large']),
});
export type TechDebtItem = z.infer<typeof TechDebtItemSchema>;

// --- ReflectionResult ---

export const ReflectionResultSchema = z.object({
  patterns: z.array(z.string()),
  improvements: z.array(ImprovementSchema),
  techDebt: z.array(TechDebtItemSchema),
});
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

// --- Action ---

export const ActionSchema = z.object({
  type: z.enum(['skill_proposal', 'planner_task', 'morning_brief']),
  payload: z.unknown(),
});
export type Action = z.infer<typeof ActionSchema>;

// --- HeartbeatReport ---

export type HeartbeatReport = {
  timestamp: string;
  pulseResult: PulseResult;
  reflection?: ReflectionResult;
  actions: Action[];
};
