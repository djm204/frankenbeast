/**
 * dep-bridge.ts — Maps legacy CliDepOptions to the new BeastDepsConfig + ExistingDeps
 * shapes so callers can gradually migrate from createCliDeps() to createBeastDeps().
 *
 * Pure mapping functions — no component creation, no side effects.
 */

import { resolve } from 'node:path';
import type { CliDepOptions } from './dep-factory.js';
import type {
  BeastDepsConfig,
  ExistingDeps,
  ProviderConfig,
} from './create-beast-deps.js';
import type { SecurityProfile } from '../middleware/security-profiles.js';
import type { BeastLoopDeps, IObserverModule } from '../deps.js';

// ─── Provider name → type detection ───

type ProviderType = ProviderConfig['type'];

function detectProviderType(name: string): ProviderType {
  const lower = name.toLowerCase();
  if (lower.includes('claude')) return 'claude-cli';
  if (lower.includes('codex')) return 'codex-cli';
  if (lower.includes('gemini')) return 'gemini-cli';
  if (lower.includes('anthropic')) return 'anthropic-api';
  if (lower.includes('openai')) return 'openai-api';
  return 'claude-cli'; // CLI default
}

// ─── Security tier mapping ───

const SECURITY_TIER_MAP: Record<string, SecurityProfile> = {
  STRICT: 'strict',
  MODERATE: 'standard',
  PERMISSIVE: 'permissive',
};

// ─── bridgeToBeastConfig ───

/**
 * Maps old CliDepOptions config format to the new BeastDepsConfig shape.
 */
export function bridgeToBeastConfig(options: CliDepOptions): BeastDepsConfig {
  // Resolve effective primary provider (runConfig overrides take precedence)
  const effectiveProvider =
    options.runConfig?.llmConfig?.default?.provider
    ?? options.runConfig?.provider
    ?? options.provider;

  // Build provider list: primary first, then additional (deduplicated)
  const providerNames: string[] = [];
  providerNames.push(effectiveProvider);

  if (options.providers) {
    for (const name of options.providers) {
      if (!providerNames.includes(name)) {
        providerNames.push(name);
      }
    }
  }

  const providers: ProviderConfig[] = providerNames.map((name) => {
    const config: ProviderConfig = {
      name,
      type: detectProviderType(name),
    };

    // Map providersConfig.command → cliPath
    const override = options.providersConfig?.[name];
    if (override?.command) {
      return { ...config, cliPath: override.command };
    }

    return config;
  });

  // Security
  const securityProfile: SecurityProfile =
    SECURITY_TIER_MAP[options.firewallSecurityTier ?? ''] ?? 'standard';

  // Brain
  const dbPath = resolve(options.paths.buildDir, 'memory.db');

  return {
    providers,
    security: {
      profile: securityProfile,
    },
    brain: {
      dbPath,
    },
    skillsDir: options.skillsDir ?? resolve(options.paths.root, 'skills'),
    reflection: true,
  };
}

// ─── bridgeToExistingDeps ───

/**
 * Components that callers pass in to be bundled into ExistingDeps.
 * These are typically created by the caller (session.ts, run.ts)
 * and need to be passed through to createBeastDeps.
 */
export interface BridgeComponents {
  planner: BeastLoopDeps['planner'];
  critique: BeastLoopDeps['critique'];
  governor: BeastLoopDeps['governor'];
  observer: IObserverModule;
  logger: BeastLoopDeps['logger'];
  graphBuilder?: BeastLoopDeps['graphBuilder'];
  cliExecutor?: BeastLoopDeps['cliExecutor'];
  checkpoint?: BeastLoopDeps['checkpoint'];
  prCreator?: BeastLoopDeps['prCreator'];
  refreshPlanTasks?: BeastLoopDeps['refreshPlanTasks'];
  runConfigOverrides?: BeastLoopDeps['runConfigOverrides'];
  clock?: BeastLoopDeps['clock'];
}

/**
 * Assembles individually-created components into the ExistingDeps shape
 * expected by createBeastDeps().
 */
export function bridgeToExistingDeps(components: BridgeComponents): ExistingDeps {
  return {
    planner: components.planner,
    critique: components.critique,
    governor: components.governor,
    observer: components.observer,
    logger: components.logger,
    ...(components.graphBuilder !== undefined ? { graphBuilder: components.graphBuilder } : {}),
    ...(components.cliExecutor !== undefined ? { cliExecutor: components.cliExecutor } : {}),
    ...(components.checkpoint !== undefined ? { checkpoint: components.checkpoint } : {}),
    ...(components.prCreator !== undefined ? { prCreator: components.prCreator } : {}),
    ...(components.refreshPlanTasks !== undefined ? { refreshPlanTasks: components.refreshPlanTasks } : {}),
    ...(components.runConfigOverrides !== undefined ? { runConfigOverrides: components.runConfigOverrides } : {}),
    ...(components.clock !== undefined ? { clock: components.clock } : {}),
  };
}
