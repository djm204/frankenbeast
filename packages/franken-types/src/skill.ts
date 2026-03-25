import { z } from 'zod';
import { ToolDefinitionSchema } from './provider.js';

/**
 * mcp.json format — collection of MCP servers for a skill.
 * The inner object matches McpServerConfig from provider.ts.
 */
export const McpConfigSchema = z.object({
  mcpServers: z.record(
    z.object({
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      env: z.record(z.string()).optional(),
      url: z.string().url().optional(),
    }),
  ),
});
export type McpConfig = z.infer<typeof McpConfigSchema>;

/** Installed skill metadata */
export const SkillInfoSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  hasContext: z.boolean(),
  provider: z.string().optional(),
  mcpServerCount: z.number().int().nonnegative(),
  installedAt: z.string().datetime(),
});
export type SkillInfo = z.infer<typeof SkillInfoSchema>;

/** Optional API-provider tool manifest (tools.json) */
export const SkillToolManifestSchema = z.array(ToolDefinitionSchema);
export type SkillToolManifest = z.infer<typeof SkillToolManifestSchema>;

/** Run config skills array */
export const SkillsConfigSchema = z.array(z.string().min(1));
