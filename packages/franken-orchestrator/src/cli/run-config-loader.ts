import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const LlmOverrideSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
}).strict();

export const LlmConfigSchema = z.object({
  default: LlmOverrideSchema.optional(),
  overrides: z.record(z.string(), LlmOverrideSchema).optional(),
}).strict();

export const ModulesConfigSchema = z.object({
  firewall: z.boolean().optional(),
  skills: z.boolean().optional(),
  memory: z.boolean().optional(),
  planner: z.boolean().optional(),
  critique: z.boolean().optional(),
  governor: z.boolean().optional(),
  heartbeat: z.boolean().optional(),
}).strict();

export const GitConfigSchema = z.object({
  preset: z.string().optional(),
  baseBranch: z.string().optional(),
  branchPattern: z.string().optional(),
  prCreation: z.enum(['auto', 'manual', 'disabled']).optional(),
  mergeStrategy: z.enum(['merge', 'squash', 'rebase']).optional(),
}).strict();

export const PromptConfigSchema = z.object({
  text: z.string().optional(),
  files: z.array(z.string()).optional(),
}).strict();

export const RunConfigSchema = z.object({
  provider: z.string(),
  objective: z.string().optional(),
  chunkDirectory: z.string().optional(),
  llmConfig: LlmConfigSchema.optional(),
  modules: ModulesConfigSchema.optional(),
  gitConfig: GitConfigSchema.optional(),
  promptConfig: PromptConfigSchema.optional(),
  maxTotalTokens: z.number().optional(),
}).passthrough();

export type RunConfig = z.infer<typeof RunConfigSchema>;

/**
 * Load and validate a RunConfig from a JSON file path.
 * Throws if the file does not exist or the content fails Zod validation.
 */
export function loadRunConfig(filePath: string): RunConfig {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return RunConfigSchema.parse(parsed);
}

/**
 * Load RunConfig from the FRANKENBEAST_RUN_CONFIG environment variable.
 * Returns undefined if the env var is not set.
 */
export function loadRunConfigFromEnv(): RunConfig | undefined {
  const filePath = process.env['FRANKENBEAST_RUN_CONFIG'];
  if (!filePath) return undefined;
  return loadRunConfig(filePath);
}
