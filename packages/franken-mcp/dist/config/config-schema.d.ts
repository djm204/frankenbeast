import { z } from "zod";
declare const serverConfigSchema: z.ZodObject<{
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    initTimeoutMs: z.ZodOptional<z.ZodNumber>;
    callTimeoutMs: z.ZodOptional<z.ZodNumber>;
    constraints: z.ZodOptional<z.ZodObject<{
        is_destructive: z.ZodOptional<z.ZodBoolean>;
        requires_hitl: z.ZodOptional<z.ZodBoolean>;
        sandbox_type: z.ZodOptional<z.ZodEnum<["DOCKER", "WASM", "LOCAL"]>>;
    }, "strip", z.ZodTypeAny, {
        is_destructive?: boolean | undefined;
        requires_hitl?: boolean | undefined;
        sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
    }, {
        is_destructive?: boolean | undefined;
        requires_hitl?: boolean | undefined;
        sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
    }>>;
    toolOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        constraints: z.ZodOptional<z.ZodObject<{
            is_destructive: z.ZodOptional<z.ZodBoolean>;
            requires_hitl: z.ZodOptional<z.ZodBoolean>;
            sandbox_type: z.ZodOptional<z.ZodEnum<["DOCKER", "WASM", "LOCAL"]>>;
        }, "strip", z.ZodTypeAny, {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        }, {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
    }, {
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    command: string;
    args: string[];
    constraints?: {
        is_destructive?: boolean | undefined;
        requires_hitl?: boolean | undefined;
        sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
    } | undefined;
    env?: Record<string, string> | undefined;
    initTimeoutMs?: number | undefined;
    callTimeoutMs?: number | undefined;
    toolOverrides?: Record<string, {
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
    }> | undefined;
}, {
    command: string;
    constraints?: {
        is_destructive?: boolean | undefined;
        requires_hitl?: boolean | undefined;
        sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
    } | undefined;
    args?: string[] | undefined;
    env?: Record<string, string> | undefined;
    initTimeoutMs?: number | undefined;
    callTimeoutMs?: number | undefined;
    toolOverrides?: Record<string, {
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
    }> | undefined;
}>;
export declare const mcpConfigSchema: z.ZodObject<{
    servers: z.ZodRecord<z.ZodString, z.ZodObject<{
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        initTimeoutMs: z.ZodOptional<z.ZodNumber>;
        callTimeoutMs: z.ZodOptional<z.ZodNumber>;
        constraints: z.ZodOptional<z.ZodObject<{
            is_destructive: z.ZodOptional<z.ZodBoolean>;
            requires_hitl: z.ZodOptional<z.ZodBoolean>;
            sandbox_type: z.ZodOptional<z.ZodEnum<["DOCKER", "WASM", "LOCAL"]>>;
        }, "strip", z.ZodTypeAny, {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        }, {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        }>>;
        toolOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            constraints: z.ZodOptional<z.ZodObject<{
                is_destructive: z.ZodOptional<z.ZodBoolean>;
                requires_hitl: z.ZodOptional<z.ZodBoolean>;
                sandbox_type: z.ZodOptional<z.ZodEnum<["DOCKER", "WASM", "LOCAL"]>>;
            }, "strip", z.ZodTypeAny, {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            }, {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            constraints?: {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            } | undefined;
        }, {
            constraints?: {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            } | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        args: string[];
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
        env?: Record<string, string> | undefined;
        initTimeoutMs?: number | undefined;
        callTimeoutMs?: number | undefined;
        toolOverrides?: Record<string, {
            constraints?: {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            } | undefined;
        }> | undefined;
    }, {
        command: string;
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
        initTimeoutMs?: number | undefined;
        callTimeoutMs?: number | undefined;
        toolOverrides?: Record<string, {
            constraints?: {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            } | undefined;
        }> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    servers: Record<string, {
        command: string;
        args: string[];
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
        env?: Record<string, string> | undefined;
        initTimeoutMs?: number | undefined;
        callTimeoutMs?: number | undefined;
        toolOverrides?: Record<string, {
            constraints?: {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            } | undefined;
        }> | undefined;
    }>;
}, {
    servers: Record<string, {
        command: string;
        constraints?: {
            is_destructive?: boolean | undefined;
            requires_hitl?: boolean | undefined;
            sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
        } | undefined;
        args?: string[] | undefined;
        env?: Record<string, string> | undefined;
        initTimeoutMs?: number | undefined;
        callTimeoutMs?: number | undefined;
        toolOverrides?: Record<string, {
            constraints?: {
                is_destructive?: boolean | undefined;
                requires_hitl?: boolean | undefined;
                sandbox_type?: "DOCKER" | "WASM" | "LOCAL" | undefined;
            } | undefined;
        }> | undefined;
    }>;
}>;
export type McpConfig = z.infer<typeof mcpConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export {};
