import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import {
  assertRuntimeConfigIntegrity,
  runtimeConfigIntegrityManifestPath,
} from '../beasts/execution/runtime-config-integrity.js';
import { parseSafeJson } from '../utils/safe-json.js';

const MAX_RUN_CONFIG_BYTES = 1_048_576;

function printLine(...args: unknown[]): void {
  console.info(...args);
}
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
  disableBranding: z.boolean().optional(),
  mergeStrategy: z.enum(['merge', 'squash', 'rebase']).optional(),
  commitConvention: z.string().optional(),
}).strict();

export const PromptConfigSchema = z.object({
  text: z.string().optional(),
  files: z.array(z.string()).optional(),
}).strict();

export const RunConfigSchema = z.object({
  provider: z.string().optional(),
  objective: z.string().optional(),
  chunkDirectory: z.string().optional(),
  model: z.string().optional(),
  maxDurationMs: z.number().int().positive().optional(),
  skills: z.array(z.string()).optional(),
  llmConfig: LlmConfigSchema.optional(),
  modules: ModulesConfigSchema.optional(),
  gitConfig: GitConfigSchema.optional(),
  promptConfig: PromptConfigSchema.optional(),
  maxTotalTokens: z.number().optional(),
  reflection: z.boolean().optional(),
}).passthrough();

export type RunConfig = z.infer<typeof RunConfigSchema>;

export class RunConfigParseError extends Error {
  public readonly code = 'RUN_CONFIG_PARSE_ERROR';

  constructor(
    public readonly filePath: string,
    public readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`Failed to parse run config JSON at ${filePath}: ${reason}`, options);
    this.name = 'RunConfigParseError';
  }
}

export function assertRunConfigIntegrity(filePath: string, configContent?: string | Buffer): void {
  assertRunConfigSize(filePath);
  assertRuntimeConfigIntegrity({
    configPath: filePath,
    manifestPath: runtimeConfigIntegrityManifestPath(filePath),
    bypass: process.env.FRANKENBEAST_RUN_CONFIG_INTEGRITY_BYPASS === '1',
    configContent,
  });
}

function assertRunConfigSize(filePath: string): void {
  const info = statSync(filePath);
  if (info.size > MAX_RUN_CONFIG_BYTES) {
    throw new RunConfigParseError(filePath, `Run config ${filePath} exceeds maxBytes: ${info.size} > ${MAX_RUN_CONFIG_BYTES}`);
  }
}

function readRunConfigFile(filePath: string): string {
  assertRunConfigSize(filePath);
  return readFileSync(filePath, 'utf-8');
}

/**
 * Load and validate a RunConfig from a JSON file path.
 * Throws if the file does not exist or the content fails Zod validation.
 */
export function loadRunConfig(filePath: string, verifiedRaw?: string): RunConfig {
  const raw = verifiedRaw ?? readRunConfigFile(filePath);
  let parsed: unknown;
  try {
    parsed = parseSafeJson(raw, {
      context: `Run config ${filePath}`,
      maxBytes: MAX_RUN_CONFIG_BYTES,
      maxDepth: 64,
      maxContainers: 10_000,
      maxObjectKeys: 20_000,
      maxArrayItems: 50_000,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RunConfigParseError(filePath, reason, error instanceof Error ? { cause: error } : undefined);
  }
  return RunConfigSchema.parse(parsed);
}

/**
 * Load RunConfig from the FRANKENBEAST_RUN_CONFIG environment variable.
 * Returns undefined if the env var is not set.
 */
export function loadRunConfigFromEnv(): RunConfig | undefined {
  const filePath = process.env['FRANKENBEAST_RUN_CONFIG'];
  if (!filePath) return undefined;
  const raw = readRunConfigFile(filePath);
  assertRunConfigIntegrity(filePath, raw);
  const config = loadRunConfig(filePath, raw);
  printLine(`loaded config from ${filePath}`);
  return config;
}
