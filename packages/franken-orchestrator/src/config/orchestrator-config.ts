import { z } from 'zod';
import { NetworkConfigSchema } from '../network/network-config.js';

// Consolidation schemas (moved from run-config-v2.ts)

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

export const BrainConfigSchema = z.object({
  dbPath: z.string().optional(),
});

export const ProviderOverrideSchema = z.object({
  command: z.string().optional(),
  model: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

export const ProvidersConfigSchema = z.object({
  /** Default provider name. */
  default: z.string().default('claude'),
  /** Ordered fallback chain of provider names. */
  fallbackChain: z.array(z.string()).default(['claude', 'codex']),
  /** Per-provider overrides (command, model, extraArgs). */
  overrides: z.record(z.string(), ProviderOverrideSchema).default({}),
});

const MIN_TOTAL_TOKEN_BUDGET = 10_000;
const MIN_DURATION_MS_PER_CRITIQUE_ITERATION = 10_000;

const BaseOrchestratorConfigSchema = z.object({
  /** Maximum plan-critique iterations before escalation. */
  maxCritiqueIterations: z.number().int().min(1).max(10).default(3),

  /** Maximum total tokens before budget breaker trips. */
  maxTotalTokens: z
    .number()
    .int()
    .min(MIN_TOTAL_TOKEN_BUDGET, {
      message: `maxTotalTokens must be at least ${MIN_TOTAL_TOKEN_BUDGET} tokens`,
    })
    .default(100_000),

  /** Maximum execution time in milliseconds. */
  maxDurationMs: z.number().int().min(1000).default(300_000),

  /** Whether to run a heartbeat pulse after execution. */
  enableHeartbeat: z.boolean().default(true),

  /** Whether to emit observability spans. */
  enableTracing: z.boolean().default(true),

  /** Whether to run LLM-based reflection at phase boundaries. */
  enableReflection: z.boolean().default(false),

  /** Minimum critique score to pass (0-1, exclusive upper bound). */
  minCritiqueScore: z
    .number()
    .min(0)
    .lt(1, {
      message: 'minCritiqueScore must be less than 1 so a plan can pass',
    })
    .default(0.7),

  /** Provider configuration. */
  providers: ProvidersConfigSchema.default({}),

  /** Consolidation: security middleware configuration. */
  security: SecurityConfigInputSchema.optional(),

  /** Consolidation: brain/memory database configuration. */
  brain: BrainConfigSchema.optional(),

  /** Directory for durable Beast phase state snapshots. */
  stateDir: z.string().optional(),

  /** Consolidation: typed provider list for ProviderRegistry. */
  consolidatedProviders: z.array(ProviderConfigSchema).optional(),
});

export const OrchestratorConfigSchema = BaseOrchestratorConfigSchema.extend(
  NetworkConfigSchema.shape,
).superRefine((config, ctx) => {
  const minDurationMs =
    config.maxCritiqueIterations * MIN_DURATION_MS_PER_CRITIQUE_ITERATION;
  if (config.maxDurationMs < minDurationMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxDurationMs'],
      message:
        `maxDurationMs must be at least ${minDurationMs}ms ` +
        `for ${config.maxCritiqueIterations} critique iterations`,
    });
  }
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export function defaultConfig(): OrchestratorConfig {
  return OrchestratorConfigSchema.parse({});
}
