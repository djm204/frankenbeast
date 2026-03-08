import { z } from 'zod/v4';
export declare const FlagSeveritySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
export type FlagSeverity = z.infer<typeof FlagSeveritySchema>;
export declare const FlagSchema: z.ZodObject<{
    source: z.ZodString;
    description: z.ZodString;
    severity: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>;
export type Flag = z.infer<typeof FlagSchema>;
export declare const PulseResultSchema: z.ZodUnion<readonly [z.ZodObject<{
    status: z.ZodLiteral<"HEARTBEAT_OK">;
}, z.core.$strip>, z.ZodObject<{
    status: z.ZodLiteral<"FLAGS_FOUND">;
    flags: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        description: z.ZodString;
        severity: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>]>;
export type PulseResult = {
    status: 'HEARTBEAT_OK';
} | {
    status: 'FLAGS_FOUND';
    flags: Flag[];
};
export declare const ImprovementSchema: z.ZodObject<{
    target: z.ZodString;
    description: z.ZodString;
    priority: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>;
export type Improvement = z.infer<typeof ImprovementSchema>;
export declare const TechDebtItemSchema: z.ZodObject<{
    location: z.ZodString;
    description: z.ZodString;
    effort: z.ZodEnum<{
        medium: "medium";
        small: "small";
        large: "large";
    }>;
}, z.core.$strip>;
export type TechDebtItem = z.infer<typeof TechDebtItemSchema>;
export declare const ReflectionResultSchema: z.ZodObject<{
    patterns: z.ZodArray<z.ZodString>;
    improvements: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        description: z.ZodString;
        priority: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>>;
    techDebt: z.ZodArray<z.ZodObject<{
        location: z.ZodString;
        description: z.ZodString;
        effort: z.ZodEnum<{
            medium: "medium";
            small: "small";
            large: "large";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;
export declare const ActionSchema: z.ZodObject<{
    type: z.ZodEnum<{
        skill_proposal: "skill_proposal";
        planner_task: "planner_task";
        morning_brief: "morning_brief";
    }>;
    payload: z.ZodUnknown;
}, z.core.$strip>;
export type Action = z.infer<typeof ActionSchema>;
export type HeartbeatReport = {
    timestamp: string;
    pulseResult: PulseResult;
    reflection?: ReflectionResult;
    actions: Action[];
};
//# sourceMappingURL=types.d.ts.map