import { z } from "zod";

const constraintsSchema = z.object({
  is_destructive: z.boolean(),
  requires_hitl: z.boolean(),
  sandbox_type: z.enum(["DOCKER", "WASM", "LOCAL"]),
}).partial(); // All optional -- missing fields use module defaults

const toolOverrideSchema = z.object({
  constraints: constraintsSchema.optional(),
});

const serverConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  initTimeoutMs: z.number().positive().optional(),
  callTimeoutMs: z.number().positive().optional(),
  constraints: constraintsSchema.optional(),
  toolOverrides: z.record(toolOverrideSchema).optional(),
});

export const mcpConfigSchema = z.object({
  servers: z.record(serverConfigSchema),
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
