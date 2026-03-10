import { z } from 'zod';
import { NetworkConfigSchema } from '../network/network-config.js';

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

const BaseOrchestratorConfigSchema = z.object({
  /** Maximum plan-critique iterations before escalation. */
  maxCritiqueIterations: z.number().int().min(1).max(10).default(3),

  /** Maximum total tokens before budget breaker trips. */
  maxTotalTokens: z.number().int().min(1000).default(100_000),

  /** Maximum execution time in milliseconds. */
  maxDurationMs: z.number().int().min(1000).default(300_000),

  /** Whether to run a heartbeat pulse after execution. */
  enableHeartbeat: z.boolean().default(true),

  /** Whether to emit observability spans. */
  enableTracing: z.boolean().default(true),

  /** Minimum critique score to pass (0-1). */
  minCritiqueScore: z.number().min(0).max(1).default(0.7),

  /** Provider configuration. */
  providers: ProvidersConfigSchema.default({}),
});

export const OrchestratorConfigSchema = BaseOrchestratorConfigSchema.extend(NetworkConfigSchema.shape);

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export function defaultConfig(): OrchestratorConfig {
  return OrchestratorConfigSchema.parse({});
}
