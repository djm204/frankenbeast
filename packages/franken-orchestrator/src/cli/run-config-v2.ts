import { z } from 'zod';
import { CommsRunConfigSchema } from '../comms/config/comms-run-config.js';

/**
 * Run Config v2 — consolidated schema for all Frankenbeast configuration.
 * Supports YAML, JSON, CLI flags, and env vars.
 * Precedence: CLI flags > env vars > config file > defaults.
 */

export const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    'claude-cli',
    'codex-cli',
    'gemini-cli',
    'anthropic-api',
    'openai-api',
    'gemini-api',
  ]),
  apiKey: z.string().optional(),
  cliPath: z.string().optional(),
});

export const SecurityConfigInputSchema = z.object({
  profile: z.enum(['strict', 'standard', 'permissive']).optional(),
  injectionDetection: z.boolean().optional(),
  piiMasking: z.boolean().optional(),
  outputValidation: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  maxTokenBudget: z.number().positive().optional(),
  requireApproval: z.enum(['all', 'destructive', 'none']).optional(),
});

export const CritiqueConfigSchema = z.object({
  evaluators: z.array(z.string()).optional(),
});

export const BrainConfigSchema = z.object({
  dbPath: z.string().optional(),
});

export const RunConfigV2Schema = z
  .object({
    // Identity
    runId: z.string().optional(),

    // Provider configuration
    provider: z.string().optional(), // backward compat: single provider name
    providers: z.array(ProviderConfigSchema).optional(),

    // Task
    objective: z.string().optional(),
    model: z.string().optional(),
    maxDurationMs: z.number().int().positive().optional(),
    maxTotalTokens: z.number().positive().optional(),
    maxTokens: z.number().positive().optional(),

    // Skills
    skills: z.array(z.string()).optional(),
    skillsDir: z.string().optional(),

    // Security
    security: SecurityConfigInputSchema.optional(),

    // Critique
    critique: CritiqueConfigSchema.optional(),

    // Reflection
    reflection: z.boolean().optional(),

    // Brain/Memory
    brain: BrainConfigSchema.optional(),

    // Communications
    comms: CommsRunConfigSchema.optional(),
  })
  .passthrough();

export type RunConfigV2 = z.infer<typeof RunConfigV2Schema>;

/**
 * Parse and validate a run config from a raw object (parsed YAML/JSON).
 */
export function parseRunConfig(raw: unknown): RunConfigV2 {
  return RunConfigV2Schema.parse(raw);
}

/**
 * Merge CLI args into a run config with correct precedence.
 * CLI args override file config. Nested objects are deep-merged
 * so partial overrides don't drop sibling fields.
 */
export function mergeCliArgs(
  fileConfig: RunConfigV2,
  cliArgs: Partial<RunConfigV2>,
): RunConfigV2 {
  const merged = { ...fileConfig } as Record<string, unknown>;

  for (const [key, value] of Object.entries(cliArgs)) {
    if (value === undefined) continue;

    const existing = merged[key];
    // Deep merge plain objects (security, critique, brain, comms)
    if (
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      merged[key] = { ...existing, ...value };
    } else {
      merged[key] = value;
    }
  }

  return RunConfigV2Schema.parse(merged);
}
