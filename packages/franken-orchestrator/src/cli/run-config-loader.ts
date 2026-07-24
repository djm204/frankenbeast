import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import { parseSafeJson } from '../utils/safe-json.js';
import {
  RUN_CONFIG_INTEGRITY_BYPASS_ENV,
  RUN_CONFIG_INTEGRITY_ENV,
  RUN_CONFIG_INTEGRITY_SECRET_ENV,
  verifyRunConfigIntegrity,
} from './run-config-integrity.js';

function printLine(...args: unknown[]): void {
  console.info(...args);
}

function printWarning(...args: unknown[]): void {
  console.warn(...args);
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
  definitionId: z.string().min(1).optional(),
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

/**
 * Load and validate a RunConfig from a JSON file path.
 * Throws if the file does not exist or the content fails Zod validation.
 */
const verifiedRunConfigCache = new Map<string, Buffer>();

function runConfigCacheKey(filePath: string, manifestPath: string): string {
  return `${filePath}\u0000${manifestPath}`;
}

function verifyRunConfigIntegrityFromEnv(filePath: string): Buffer | undefined {
  if (process.env[RUN_CONFIG_INTEGRITY_BYPASS_ENV] === '1') {
    printWarning(`runtime config integrity bypass enabled for ${filePath}`);
    return undefined;
  }

  const manifestPath = process.env[RUN_CONFIG_INTEGRITY_ENV];
  const secret = process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
  if (!manifestPath && !secret) return undefined;
  const cacheKey = manifestPath ? runConfigCacheKey(filePath, manifestPath) : undefined;
  if (!secret && cacheKey) {
    const cachedBytes = verifiedRunConfigCache.get(cacheKey);
    if (cachedBytes) return cachedBytes;
  }
  const verifiedBytes = verifyRunConfigIntegrity(filePath, manifestPath ?? '', secret ?? '');
  if (cacheKey) {
    verifiedRunConfigCache.set(cacheKey, verifiedBytes);
  }
  delete process.env[RUN_CONFIG_INTEGRITY_SECRET_ENV];
  return verifiedBytes;
}

function readRunConfigRaw(filePath: string): string {
  const verifiedBytes = verifyRunConfigIntegrityFromEnv(filePath);
  if (verifiedBytes) {
    return verifiedBytes.toString('utf-8');
  }

  const info = statSync(filePath);
  if (info.size > 1_048_576) {
    throw new RunConfigParseError(filePath, `Run config ${filePath} exceeds maxBytes: ${info.size} > 1048576`);
  }
  return readFileSync(filePath, 'utf-8');
}

export function loadRunConfigDocument(filePath: string): unknown {
  const raw = readRunConfigRaw(filePath);
  let parsed: unknown;
  try {
    parsed = parseSafeJson(raw, {
      context: `Run config ${filePath}`,
      maxBytes: 1_048_576,
      maxDepth: 64,
      maxContainers: 10_000,
      maxObjectKeys: 20_000,
      maxArrayItems: 50_000,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RunConfigParseError(filePath, reason, error instanceof Error ? { cause: error } : undefined);
  }
  return parsed;
}

export function loadRunConfig(filePath: string): RunConfig {
  return RunConfigSchema.parse(loadRunConfigDocument(filePath));
}

/**
 * Load RunConfig from the FRANKENBEAST_RUN_CONFIG environment variable.
 * Returns undefined if the env var is not set.
 */
export function loadRunConfigFromEnv(): RunConfig | undefined {
  const filePath = process.env['FRANKENBEAST_RUN_CONFIG'];
  if (!filePath) return undefined;
  const config = loadRunConfig(filePath);
  printLine(`loaded config from ${filePath}`);
  return config;
}

export function loadRunConfigDocumentFromEnv(): unknown | undefined {
  const filePath = process.env['FRANKENBEAST_RUN_CONFIG'];
  if (!filePath) return undefined;
  return loadRunConfigDocument(filePath);
}
