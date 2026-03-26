import { readFile } from 'node:fs/promises';
import { OrchestratorConfigSchema, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { applyNetworkConfigSets } from '../network/network-config-paths.js';
import type { CliArgs } from './args.js';

/** Environment variable prefix for orchestrator config. */
const ENV_PREFIX = 'FRANKEN_';

/** Extract config values from environment variables. */
function fromEnv(): Partial<OrchestratorConfig> {
  const env: Partial<OrchestratorConfig> = {};

  const maxTokens = process.env[`${ENV_PREFIX}MAX_TOTAL_TOKENS`];
  if (maxTokens) env.maxTotalTokens = Number(maxTokens);

  const maxDuration = process.env[`${ENV_PREFIX}MAX_DURATION_MS`];
  if (maxDuration) env.maxDurationMs = Number(maxDuration);

  const maxCritique = process.env[`${ENV_PREFIX}MAX_CRITIQUE_ITERATIONS`];
  if (maxCritique) env.maxCritiqueIterations = Number(maxCritique);

  const heartbeat = process.env[`${ENV_PREFIX}ENABLE_HEARTBEAT`];
  if (heartbeat !== undefined) env.enableHeartbeat = heartbeat === 'true';

  const tracing = process.env[`${ENV_PREFIX}ENABLE_TRACING`];
  if (tracing !== undefined) env.enableTracing = tracing === 'true';

  const reflection = process.env[`${ENV_PREFIX}ENABLE_REFLECTION`];
  if (reflection !== undefined) env.enableReflection = reflection === 'true';

  const minScore = process.env[`${ENV_PREFIX}MIN_CRITIQUE_SCORE`];
  if (minScore) env.minCritiqueScore = Number(minScore);

  return env;
}

/** Load config from a JSON file. */
async function fromFile(filePath: string): Promise<Partial<OrchestratorConfig>> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as Partial<OrchestratorConfig>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(...layers: Array<Partial<T>>): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      const existing = result[key];
      if (isRecord(existing) && isRecord(value)) {
        result[key] = deepMerge(existing, value);
      } else {
        result[key] = value;
      }
    }
  }

  return result as Partial<T>;
}

/** Extract config overrides from CLI args. */
function fromCli(args: CliArgs): Partial<OrchestratorConfig> {
  const cli: Partial<OrchestratorConfig> = {};

  if (args.verbose) {
    cli.enableTracing = true;
  }

  return cli;
}

/**
 * Loads and merges config from all sources.
 * Priority: CLI > env > file > defaults
 */
export async function loadConfig(args: CliArgs): Promise<OrchestratorConfig> {
  let fileConfig: Partial<OrchestratorConfig> = {};
  if (args.config) {
    fileConfig = await fromFile(args.config);
  }

  const envConfig = fromEnv();
  const cliConfig = fromCli(args);

  let merged = deepMerge<OrchestratorConfig>(
    fileConfig as Partial<Record<string, unknown>>,
    envConfig as Partial<Record<string, unknown>>,
    cliConfig as Partial<Record<string, unknown>>,
  );

  if (args.networkSet && args.networkSet.length > 0) {
    merged = applyNetworkConfigSets(merged, args.networkSet);
  }

  return OrchestratorConfigSchema.parse(merged);
}
