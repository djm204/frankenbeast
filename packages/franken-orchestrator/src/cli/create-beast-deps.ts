import { SqliteBrain } from 'franken-brain';
import { ProviderRegistry } from '../providers/provider-registry.js';
import {
  buildMiddlewareChain,
  resolveSecurityConfig,
  type SecurityProfile,
} from '../middleware/security-profiles.js';
import { SkillManager } from '../skills/skill-manager.js';
import { SkillConfigStore } from '../skills/skill-config-store.js';
import { AuditTrail, AuditTrailStore, createAuditEvent } from '@frankenbeast/observer';
import { ReplayContentStore } from '../replay/replay-content-store.js';
import { join, basename, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { MiddlewareChainFirewallAdapter } from '../adapters/middleware-firewall-adapter.js';
import { SqliteBrainMemoryAdapter } from '../adapters/brain-memory-adapter.js';
import { ReflectionHeartbeatAdapter } from '../adapters/reflection-heartbeat-adapter.js';
import { SkillManagerAdapter } from '../adapters/skill-manager-adapter.js';
import { AuditTrailObserverAdapter } from '../adapters/audit-observer-adapter.js';
import { McpSdkAdapter } from '../adapters/mcp-sdk-adapter.js';
import { ProviderRegistryIAdapter } from '../adapters/provider-registry-adapter.js';
import { AdapterLlmClient } from '../adapters/adapter-llm-client.js';
// NOTE: `@franken/critique` is imported lazily inside `reflectionFn` (see below).
// A top-level static import would make this module — and everything that
// statically imports it (e.g. dep-factory) — fail to evaluate when the
// optional `@franken/critique` package is absent. That would short-circuit the
// fail-closed / config-disable / FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES
// opt-out handling in dep-factory before it can run (issue #364, ADR-036).

import { ClaudeCliAdapter } from '../providers/claude-cli-adapter.js';
import { CodexCliAdapter } from '../providers/codex-cli-adapter.js';
import { GeminiCliAdapter } from '../providers/gemini-cli-adapter.js';
import { AnthropicApiAdapter } from '../providers/anthropic-api-adapter.js';
import { OpenAiApiAdapter } from '../providers/openai-api-adapter.js';
import { GeminiApiAdapter } from '../providers/gemini-api-adapter.js';

import type { BeastLoopDeps, IObserverModule, McpToolInfo } from '../deps.js';
import type { ILlmProvider } from '@franken/types';
import type { AggregatedTokenUsage } from '../providers/token-aggregator.js';

// --- Config types ---

export interface ProviderConfig {
  name: string;
  type:
    | 'claude-cli'
    | 'codex-cli'
    | 'gemini-cli'
    | 'anthropic-api'
    | 'openai-api'
    | 'gemini-api';
  apiKey?: string;
  cliPath?: string;
}

export interface BeastDepsConfig {
  providers?: ProviderConfig[];
  security?: {
    profile?: SecurityProfile;
    injectionDetection?: boolean;
    piiMasking?: boolean;
    outputValidation?: boolean;
    allowedDomains?: string[];
    maxTokenBudget?: number;
    requireApproval?: 'all' | 'destructive' | 'none';
  };
  brain?: {
    dbPath?: string;
  };
  skillsDir?: string;
  configDir?: string;
  reflection?: boolean;
}

export interface ExistingDeps {
  planner: BeastLoopDeps['planner'];
  critique: BeastLoopDeps['critique'];
  governor: BeastLoopDeps['governor'];
  observer: IObserverModule;
  logger: BeastLoopDeps['logger'];
  graphBuilder?: BeastLoopDeps['graphBuilder'];
  prCreator?: BeastLoopDeps['prCreator'];
  cliExecutor?: BeastLoopDeps['cliExecutor'];
  checkpoint?: BeastLoopDeps['checkpoint'];
  refreshPlanTasks?: BeastLoopDeps['refreshPlanTasks'];
  runConfigOverrides?: BeastLoopDeps['runConfigOverrides'];
  clock?: BeastLoopDeps['clock'];
}

export type ConsolidatedDeps = BeastLoopDeps & {
  providerRegistry?: ProviderRegistry;
  sqliteBrain?: SqliteBrain;
  auditTrail?: AuditTrail;
  middlewareChain?: ReturnType<typeof buildMiddlewareChain>;
  skillManager?: SkillManager;
  getTokenUsage?: () => AggregatedTokenUsage;
  persistAuditTrail?: (runId: string) => string;
};

/**
 * Creates the full BeastLoopDeps bag from config + existing deps.
 *
 * Strategy: construct new consolidation components, wrap them in
 * adapters that satisfy existing BeastLoopDeps port interfaces.
 * Phase functions (ingestion, hydration, planning, execution, closure)
 * continue to call the same interfaces — zero changes needed.
 */
export function createBeastDeps(
  config: BeastDepsConfig,
  existingDeps: ExistingDeps,
): ConsolidatedDeps {
  // 1. Brain
  const brain = new SqliteBrain(config.brain?.dbPath ?? ':memory:');

  // 2. Audit trail
  const auditTrail = new AuditTrail();
  const metadataDir = config.configDir ?? '.fbeast';
  const auditRoot = basename(metadataDir) === '.fbeast'
    ? join(metadataDir, 'audit')
    : join(metadataDir, '.fbeast', 'audit');
  const auditTrailProjectRoot = basename(metadataDir) === '.fbeast'
    ? dirname(metadataDir)
    : metadataDir;
  const replayStore = new ReplayContentStore(auditRoot);

  // 3. Provider registry
  const providers = buildProviderList(config.providers);
  const registry = new ProviderRegistry(providers, brain, {
    onProviderSwitch: (event) => {
      auditTrail.append(
        createAuditEvent('provider.switch', event, {
          phase: 'execution',
          provider: event.to,
        }),
      );
    },
  });

  // 4. Security middleware
  const securityProfile = config.security?.profile ?? 'standard';
  const securityConfig = resolveSecurityConfig(securityProfile, config.security);
  const middlewareChain = buildMiddlewareChain(securityConfig);

  // 5. Skill manager
  const configStore = new SkillConfigStore(config.configDir ?? '.fbeast');
  const skillManager = new SkillManager(
    config.skillsDir ?? './skills',
    new Set(),
    configStore,
  );

  // 6. Adapters
  const firewall = new MiddlewareChainFirewallAdapter(middlewareChain);
  const memory = new SqliteBrainMemoryAdapter(brain);

  // Wire ProviderRegistry + MiddlewareChain into heartbeat reflection via IAdapter
  const registryAdapter = new ProviderRegistryIAdapter(registry, middlewareChain);
  const registryLlmClient = new AdapterLlmClient(registryAdapter);
  const reflectionFn = config.reflection !== false
    ? async () => {
        const { ReflectionEvaluator } = await import('@franken/critique');
        const evaluator = new ReflectionEvaluator({ llmClient: registryLlmClient });
        const result = await evaluator.evaluate({
          content: 'Current execution state',
          metadata: { phase: 'execution', stepsCompleted: 0, objective: 'Reflect on progress' },
        });
        const finding = result.findings[0];
        return {
          summary: finding?.message ?? 'No reflection available.',
          improvements: finding?.suggestion ? [finding.suggestion] : [],
          techDebt: [],
        };
      }
    : undefined;

  const heartbeat = new ReflectionHeartbeatAdapter(reflectionFn);
  const skills = new SkillManagerAdapter(skillManager);
  const observer = new AuditTrailObserverAdapter(
    existingDeps.observer,
    auditTrail,
    'unknown',
    'unknown',
    replayStore,
  );
  const mcp = new McpSdkAdapter(collectEnabledMcpTools(skillManager));

  return {
    firewall,
    skills,
    memory,
    planner: existingDeps.planner,
    observer,
    critique: existingDeps.critique,
    governor: existingDeps.governor,
    heartbeat,
    logger: existingDeps.logger,
    clock: existingDeps.clock ?? (() => new Date()),
    mcp,

    // Direct access to new components
    providerRegistry: registry,
    sqliteBrain: brain,
    auditTrail,
    middlewareChain,
    skillManager,
    getTokenUsage: () => registry.getTokenUsage(),
    persistAuditTrail: (runId: string) => {
      const store = new AuditTrailStore(auditTrailProjectRoot);
      const eventPath = store.save(runId, auditTrail);
      const replayManifest = observer.getReplayManifest();
      if (replayManifest.length > 0) {
        mkdirSync(auditRoot, { recursive: true });
        writeFileSync(
          join(auditRoot, `${runId}.replay.json`),
          JSON.stringify(replayManifest, null, 2),
          'utf8',
        );
      }
      return eventPath;
    },

    // Optional pass-through deps (spread conditionally)
    ...(existingDeps.graphBuilder ? { graphBuilder: existingDeps.graphBuilder } : {}),
    ...(existingDeps.prCreator ? { prCreator: existingDeps.prCreator } : {}),
    ...(existingDeps.cliExecutor ? { cliExecutor: existingDeps.cliExecutor } : {}),
    ...(existingDeps.checkpoint ? { checkpoint: existingDeps.checkpoint } : {}),
    ...(existingDeps.refreshPlanTasks ? { refreshPlanTasks: existingDeps.refreshPlanTasks } : {}),
    ...(existingDeps.runConfigOverrides ? { runConfigOverrides: existingDeps.runConfigOverrides } : {}),
  } as ConsolidatedDeps;
}

function collectEnabledMcpTools(skillManager: SkillManager): McpToolInfo[] {
  return skillManager.getEnabledSkills().flatMap((skillName) => {
    const tools = skillManager.readTools(skillName);
    const mcpConfig = skillManager.readMcpConfig(skillName);
    const serverIds = mcpConfig ? Object.keys(mcpConfig.mcpServers) : [];
    const serverId = serverIds.length === 1 ? serverIds[0]! : skillName;

    return tools.map((tool) => ({
      name: tool.name,
      serverId,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  });
}

function buildProviderList(
  configs?: ProviderConfig[],
): ILlmProvider[] {
  if (!configs || configs.length === 0) {
    throw new Error(
      "No providers configured. Run 'frankenbeast provider add claude' to get started.",
    );
  }
  return configs.map((pc) => {
    switch (pc.type) {
      case 'claude-cli':
        return new ClaudeCliAdapter(pc.cliPath ? { binaryPath: pc.cliPath } : {});
      case 'codex-cli':
        return new CodexCliAdapter(pc.cliPath ? { binaryPath: pc.cliPath } : {});
      case 'gemini-cli':
        return new GeminiCliAdapter(pc.cliPath ? { binaryPath: pc.cliPath } : {});
      case 'anthropic-api':
        return new AnthropicApiAdapter(pc.apiKey ? { apiKey: pc.apiKey } : {});
      case 'openai-api':
        return new OpenAiApiAdapter(pc.apiKey ? { apiKey: pc.apiKey } : {});
      case 'gemini-api':
        return new GeminiApiAdapter(pc.apiKey ? { apiKey: pc.apiKey } : {});
      default:
        throw new Error(`Unknown provider type: ${(pc as { type: string }).type}`);
    }
  });
}
