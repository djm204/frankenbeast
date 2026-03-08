import { z } from 'zod/v4';
// --- Flag ---
export const FlagSeveritySchema = z.enum(['low', 'medium', 'high']);
export const FlagSchema = z.object({
    source: z.string(),
    description: z.string(),
    severity: FlagSeveritySchema,
});
// --- PulseResult ---
const HeartbeatOkSchema = z.object({ status: z.literal('HEARTBEAT_OK') });
const FlagsFoundSchema = z.object({
    status: z.literal('FLAGS_FOUND'),
    flags: z.array(FlagSchema),
});
export const PulseResultSchema = z.union([HeartbeatOkSchema, FlagsFoundSchema]);
// --- Improvement ---
export const ImprovementSchema = z.object({
    target: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
});
// --- TechDebtItem ---
export const TechDebtItemSchema = z.object({
    location: z.string(),
    description: z.string(),
    effort: z.enum(['small', 'medium', 'large']),
});
// --- ReflectionResult ---
export const ReflectionResultSchema = z.object({
    patterns: z.array(z.string()),
    improvements: z.array(ImprovementSchema),
    techDebt: z.array(TechDebtItemSchema),
});
// --- Action ---
export const ActionSchema = z.object({
    type: z.enum(['skill_proposal', 'planner_task', 'morning_brief']),
    payload: z.unknown(),
});
//# sourceMappingURL=types.js.map