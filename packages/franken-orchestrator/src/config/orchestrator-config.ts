import { z } from 'zod';
import { NetworkConfigSchema } from '../network/network-config.js';
import { validateProviderCommandOverride } from './provider-command-override-policy.js';

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
  trustCommandOverride: z.literal(true).optional(),
  trustedCommandPaths: z.array(z.string()).optional(),
  model: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
});

const RegexPatternSchema = z.string().min(1).refine((pattern) => {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}, { message: 'pattern must be a valid regular expression' });

export const SecurityRuleInputSchema = z.object({
  name: z.string().min(1),
  pattern: RegexPatternSchema,
  action: z.enum(['block', 'warn', 'log']),
  target: z.enum(['request', 'response', 'both']),
});

export const SecurityConfigInputSchema = z.object({
  profile: z.enum(['strict', 'standard', 'permissive']).optional(),
  injectionDetection: z.boolean().optional(),
  piiMasking: z.boolean().optional(),
  outputValidation: z.boolean().optional(),
  webhookSignaturePolicy: z.enum(['required', 'local-dev-unsigned']).optional(),
  allowedDomains: z.array(z.string()).optional(),
  maxTokenBudget: z.number().positive().optional(),
  requireApproval: z.enum(['all', 'destructive', 'none']).optional(),
  customRules: z.array(SecurityRuleInputSchema).optional(),
});

export const BrainConfigSchema = z.object({
  dbPath: z.string().optional(),
});

export const ProviderOverrideSchema = z.object({
  command: z.string().optional(),
  trustCommandOverride: z.literal(true).optional(),
  trustedCommandPaths: z.array(z.string()).optional(),
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
}).superRefine((providers, ctx) => {
  for (const [name, override] of Object.entries(providers.overrides)) {
    for (const message of validateProviderCommandOverride(name, override)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrides', name, 'command'],
        message,
      });
    }
  }
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

  /** Whether to run a heartbeat pulse after execution. Defaults off so production deployments must opt in. */
  enableHeartbeat: z.boolean().default(false),

  /** Whether to emit observability spans. Defaults off so production deployments must opt in. */
  enableTracing: z.boolean().default(false),

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
  config.consolidatedProviders?.forEach((provider, index) => {
    if (!provider.type.endsWith('-cli') || !provider.cliPath) return;
    for (const message of validateProviderCommandOverride(provider.type, {
      cliPath: provider.cliPath,
      trustCommandOverride: provider.trustCommandOverride,
      trustedCommandPaths: provider.trustedCommandPaths,
    })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consolidatedProviders', index, 'cliPath'],
        message,
      });
    }
  });

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
