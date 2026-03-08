import { z } from 'zod';
export declare const ProviderOverrideSchema: z.ZodObject<{
    command: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    extraArgs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    command?: string | undefined;
    model?: string | undefined;
    extraArgs?: string[] | undefined;
}, {
    command?: string | undefined;
    model?: string | undefined;
    extraArgs?: string[] | undefined;
}>;
export declare const ProvidersConfigSchema: z.ZodObject<{
    /** Default provider name. */
    default: z.ZodDefault<z.ZodString>;
    /** Ordered fallback chain of provider names. */
    fallbackChain: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Per-provider overrides (command, model, extraArgs). */
    overrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        command: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        extraArgs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        command?: string | undefined;
        model?: string | undefined;
        extraArgs?: string[] | undefined;
    }, {
        command?: string | undefined;
        model?: string | undefined;
        extraArgs?: string[] | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    default: string;
    fallbackChain: string[];
    overrides: Record<string, {
        command?: string | undefined;
        model?: string | undefined;
        extraArgs?: string[] | undefined;
    }>;
}, {
    default?: string | undefined;
    fallbackChain?: string[] | undefined;
    overrides?: Record<string, {
        command?: string | undefined;
        model?: string | undefined;
        extraArgs?: string[] | undefined;
    }> | undefined;
}>;
export declare const OrchestratorConfigSchema: z.ZodObject<{
    /** Maximum plan-critique iterations before escalation. */
    maxCritiqueIterations: z.ZodDefault<z.ZodNumber>;
    /** Maximum total tokens before budget breaker trips. */
    maxTotalTokens: z.ZodDefault<z.ZodNumber>;
    /** Maximum execution time in milliseconds. */
    maxDurationMs: z.ZodDefault<z.ZodNumber>;
    /** Whether to run a heartbeat pulse after execution. */
    enableHeartbeat: z.ZodDefault<z.ZodBoolean>;
    /** Whether to emit observability spans. */
    enableTracing: z.ZodDefault<z.ZodBoolean>;
    /** Minimum critique score to pass (0-1). */
    minCritiqueScore: z.ZodDefault<z.ZodNumber>;
    /** Provider configuration. */
    providers: z.ZodDefault<z.ZodObject<{
        /** Default provider name. */
        default: z.ZodDefault<z.ZodString>;
        /** Ordered fallback chain of provider names. */
        fallbackChain: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Per-provider overrides (command, model, extraArgs). */
        overrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
            command: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
            extraArgs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            command?: string | undefined;
            model?: string | undefined;
            extraArgs?: string[] | undefined;
        }, {
            command?: string | undefined;
            model?: string | undefined;
            extraArgs?: string[] | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        default: string;
        fallbackChain: string[];
        overrides: Record<string, {
            command?: string | undefined;
            model?: string | undefined;
            extraArgs?: string[] | undefined;
        }>;
    }, {
        default?: string | undefined;
        fallbackChain?: string[] | undefined;
        overrides?: Record<string, {
            command?: string | undefined;
            model?: string | undefined;
            extraArgs?: string[] | undefined;
        }> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    providers: {
        default: string;
        fallbackChain: string[];
        overrides: Record<string, {
            command?: string | undefined;
            model?: string | undefined;
            extraArgs?: string[] | undefined;
        }>;
    };
    maxCritiqueIterations: number;
    maxTotalTokens: number;
    maxDurationMs: number;
    enableHeartbeat: boolean;
    enableTracing: boolean;
    minCritiqueScore: number;
}, {
    providers?: {
        default?: string | undefined;
        fallbackChain?: string[] | undefined;
        overrides?: Record<string, {
            command?: string | undefined;
            model?: string | undefined;
            extraArgs?: string[] | undefined;
        }> | undefined;
    } | undefined;
    maxCritiqueIterations?: number | undefined;
    maxTotalTokens?: number | undefined;
    maxDurationMs?: number | undefined;
    enableHeartbeat?: boolean | undefined;
    enableTracing?: boolean | undefined;
    minCritiqueScore?: number | undefined;
}>;
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;
export declare function defaultConfig(): OrchestratorConfig;
//# sourceMappingURL=orchestrator-config.d.ts.map