import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { NetworkConfigFieldsSchema, validateNetworkConfig } from '../network/network-config.js';
import { validateProviderCommandOverride } from './provider-command-override-policy.js';

export interface OrchestratorConfigParseOptions {
  readonly allowTrustedProviderCommandOverrides?: boolean | undefined;
}

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

function createProvidersConfigSchema(options: OrchestratorConfigParseOptions = {}) {
  return z.object({
    /** Default provider name. */
    default: z.string().default('claude'),
    /** Ordered fallback chain of provider names. */
    fallbackChain: z.array(z.string()).default(['claude', 'codex']),
    /** Per-provider overrides (command, model, extraArgs). */
    overrides: z.record(z.string(), ProviderOverrideSchema).default(() => ({})),
  }).superRefine((providers, ctx) => {
    for (const [name, override] of Object.entries(providers.overrides)) {
      for (const message of validateProviderCommandOverride(name, override, {
        allowTrustedCommandOverrides: options.allowTrustedProviderCommandOverrides,
      })) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overrides', name, 'command'],
          message,
        });
      }
    }
  });
}

export const ProvidersConfigSchema = createProvidersConfigSchema();

const MIN_TOTAL_TOKEN_BUDGET = 10_000;
const MIN_DURATION_MS_PER_CRITIQUE_ITERATION = 10_000;

function resolvedPathCandidates(path: string): string[] {
  const lexical = resolve(path);
  try {
    const real = realpathSync(lexical);
    return real === lexical ? [lexical] : [real, lexical];
  } catch {
    const ancestorResolved = resolveExistingAncestor(lexical);
    return ancestorResolved && ancestorResolved !== lexical ? [ancestorResolved, lexical] : [lexical];
  }
}

function resolveExistingAncestor(lexical: string): string | undefined {
  const missingParts: string[] = [];
  let current = lexical;

  while (true) {
    try {
      const resolved = realpathSync(current);
      return missingParts.length > 0 ? join(resolved, ...missingParts.reverse()) : resolved;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return undefined;
      }
      missingParts.push(basename(current));
      current = parent;
    }
  }
}

function hermesProfileFromResolvedPath(path: string): string | undefined {
  const parts = path.split(sep);
  for (let index = 0; index < parts.length - 2; index += 1) {
    if (parts[index] === '.hermes' && parts[index + 1] === 'profiles') {
      return parts[index + 2];
    }
  }
  return undefined;
}

function hermesProfileFromPath(path: string): string | undefined {
  for (const candidate of resolvedPathCandidates(path)) {
    const profile = hermesProfileFromResolvedPath(candidate);
    if (profile !== undefined) {
      return profile;
    }
  }
  return undefined;
}

function activeHermesProfile(): string {
  const profile = process.env.HERMES_PROFILE?.trim();
  return profile && profile.length > 0 ? profile : 'default';
}

export function validateCrossProfileStateDir(config: {
  readonly stateDir?: string | undefined;
  readonly allowCrossProfileStateAccess?: boolean | undefined;
}): string | undefined {
  const targetProfile = config.stateDir ? hermesProfileFromPath(config.stateDir) : undefined;
  const currentProfile = activeHermesProfile();
  if (
    targetProfile !== undefined &&
    targetProfile !== currentProfile &&
    !config.allowCrossProfileStateAccess
  ) {
    return `stateDir points at Hermes profile '${targetProfile}' while the active profile is '${currentProfile}'. ` +
      'Cross-profile state access is denied by default; set allowCrossProfileStateAccess: true only for deliberate migrations or imports.';
  }
  return undefined;
}

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
  providers: ProvidersConfigSchema.default(() => ({
    default: 'claude',
    fallbackChain: ['claude', 'codex'],
    overrides: {},
  })),

  /** Consolidation: security middleware configuration. */
  security: SecurityConfigInputSchema.optional(),

  /** Consolidation: brain/memory database configuration. */
  brain: BrainConfigSchema.optional(),

  /** Directory for durable Beast phase state snapshots. */
  stateDir: z.string().optional(),

  /** Whether stateDir may deliberately point at another Hermes profile. Defaults denied. */
  allowCrossProfileStateAccess: z.boolean().default(false),

  /** Consolidation: typed provider list for ProviderRegistry. */
  consolidatedProviders: z.array(ProviderConfigSchema).optional(),
});

function createOrchestratorConfigSchema(options: OrchestratorConfigParseOptions = {}) {
  return BaseOrchestratorConfigSchema.extend({
    providers: createProvidersConfigSchema(options).default(() => ({
      default: 'claude',
      fallbackChain: ['claude', 'codex'],
      overrides: {},
    })),
  }).extend(
    NetworkConfigFieldsSchema.shape,
  ).superRefine((config, ctx) => {
    validateNetworkConfig(config, ctx);

    const stateDirIssue = validateCrossProfileStateDir(config);
    if (stateDirIssue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stateDir'],
        message: stateDirIssue,
      });
    }

    config.consolidatedProviders?.forEach((provider, index) => {
      if (!provider.type.endsWith('-cli') || !provider.cliPath) return;
      for (const message of validateProviderCommandOverride(provider.type, {
        cliPath: provider.cliPath,
        trustCommandOverride: provider.trustCommandOverride,
        trustedCommandPaths: provider.trustedCommandPaths,
      }, {
        allowTrustedCommandOverrides: options.allowTrustedProviderCommandOverrides,
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
}

export const OrchestratorConfigSchema = createOrchestratorConfigSchema();

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export function defaultConfig(): OrchestratorConfig {
  return OrchestratorConfigSchema.parse({});
}

export function parseOrchestratorConfig(
  config: unknown,
  options: OrchestratorConfigParseOptions = {},
): OrchestratorConfig {
  return createOrchestratorConfigSchema(options).parse(config);
}
