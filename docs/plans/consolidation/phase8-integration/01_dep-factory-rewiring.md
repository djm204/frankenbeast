# Chunk 8.1: dep-factory.ts Rewiring

**Phase:** 8 — Wire Everything Together
**Depends on:** Phases 2, 3, 4, 5, 6, 7 (all new components exist)
**Estimated size:** Medium (~200 lines)

---

## Purpose

Update `dep-factory.ts` directly to construct the new consolidation components (ProviderRegistry, SqliteBrain, MiddlewareChain, SkillManager, AuditTrail, CritiqueChain) and wrap them in adapters that satisfy the existing `BeastLoopDeps` interface. This is the single point where old→new wiring happens.

## Critical Principle: Adapters, Not Replacements

The `BeastLoopDeps` interface in `deps.ts` defines 18 module ports. Phase 1 left temporary pass-throughs for 5 deleted packages (firewall, skills, memory, heartbeat, mcp). This chunk replaces those pass-throughs with **adapter classes** that implement the old interfaces using the new components — real functionality, no stubs.

The existing `BeastLoopDeps` interface does **not** change its required fields. New optional fields are added for direct access to the new components (see Chunk 8.2).

## No Separate File — There Are No Users Yet

There are no external consumers of the old dep-factory. We modify `dep-factory.ts` directly — no `dep-factory-consolidated.ts`, no migration path, no backward compatibility shim.

## Prerequisite: Extend RunConfig Schema

The existing `RunConfig` in `run-config-loader.ts` must be extended with consolidation fields. These are additive — existing fields are preserved.

```typescript
// packages/franken-orchestrator/src/cli/run-config-loader.ts (additions to existing RunConfig)

export interface RunConfig {
  // === Pre-existing fields (unchanged) ===
  objective?: string;
  model?: string;
  maxDurationMs?: number;
  skills?: string[];                    // enabled skill names
  maxTotalTokens?: number;

  // === New consolidation fields ===
  runId?: string;                       // unique run identifier (auto-generated if omitted)
  providers?: ProviderConfig[];          // ordered list of LLM providers
  security?: SecurityConfigInput;        // security profile + overrides
  critique?: CritiqueConfig;             // evaluator configuration
  reflection?: boolean;                  // Phase 6.2: run heartbeat reflection at phase boundaries
  brain?: BrainConfig;                   // brain/memory configuration
  skillsDir?: string;                    // path to skills/ directory (default: './skills')
  maxTokens?: number;                    // per-request token limit
}

export interface ProviderConfig {
  name: string;
  type: 'claude-cli' | 'codex-cli' | 'gemini-cli' | 'anthropic-api' | 'openai-api' | 'gemini-api';
  apiKey?: string;
  cliPath?: string;                     // override binary location
}

export interface SecurityConfigInput {
  profile?: 'strict' | 'standard' | 'permissive';
  injectionDetection?: boolean;
  piiMasking?: boolean;
  outputValidation?: boolean;
  allowedDomains?: string[];
  maxTokenBudget?: number;
  requireApproval?: 'all' | 'destructive' | 'none';
}

export interface CritiqueConfig {
  evaluators?: string[];                // e.g. ['lint', 'test-pass', 'reflection']
}

export interface BrainConfig {
  dbPath?: string;                      // SQLite path (default: ':memory:')
  snapshot?: BrainSnapshot;             // for hydration from a previous run
}
```

## Implementation

```typescript
// packages/franken-orchestrator/src/cli/dep-factory.ts (rewritten in place)

import { SqliteBrain } from '@frankenbeast/brain';
import type { BrainSnapshot } from '@frankenbeast/types';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { buildMiddlewareChain, resolveSecurityConfig } from '../middleware/security-profiles.js';
import { SkillManager } from '../skills/skill-manager.js';
import { AuditTrail, createAuditEvent } from '@frankenbeast/observer';
import { CritiqueChain } from '@frankenbeast/critique';
import { ReflectionEvaluator } from '@frankenbeast/critique/evaluators/reflection-evaluator.js';

// Adapters — bridge new components to old BeastLoopDeps interface
import { MiddlewareChainFirewallAdapter } from '../adapters/middleware-firewall-adapter.js';
import { SqliteBrainMemoryAdapter } from '../adapters/brain-memory-adapter.js';
import { ReflectionHeartbeatAdapter } from '../adapters/reflection-heartbeat-adapter.js';
import { SkillManagerAdapter } from '../adapters/skill-manager-adapter.js';
import { AuditTrailObserverAdapter } from '../adapters/audit-observer-adapter.js';

import type { BeastLoopDeps, IObserverModule } from '../deps.js';
import type { RunConfig } from '../cli/run-config-loader.js';
import type { ILlmProvider, LlmRequest } from '@frankenbeast/types';

// Provider adapters
import { ClaudeCliAdapter } from '../providers/claude-cli-adapter.js';
import { CodexCliAdapter } from '../providers/codex-cli-adapter.js';
import { GeminiCliAdapter } from '../providers/gemini-cli-adapter.js';
import { AnthropicApiAdapter } from '../providers/anthropic-api-adapter.js';
import { OpenAiApiAdapter } from '../providers/openai-api-adapter.js';
import { GeminiApiAdapter } from '../providers/gemini-api-adapter.js';

/**
 * Creates the full BeastLoopDeps bag from a RunConfig.
 *
 * Strategy: construct the new consolidation components first, then wrap them
 * in adapters that satisfy the existing BeastLoopDeps port interfaces.
 * This means the phase functions (ingestion, hydration, planning, execution,
 * closure) continue to call the same interfaces — zero changes needed.
 *
 * Existing deps that are NOT replaced by consolidation (planner, critique,
 * governor, logger, graphBuilder, prCreator, cliExecutor, checkpoint,
 * refreshPlanTasks, runConfigOverrides, clock) are passed through from callers.
 */
export function createBeastDeps(
  config: RunConfig,
  existingDeps: {
    // These deps are NOT replaced by consolidation — pass through from caller
    planner: BeastLoopDeps['planner'];
    critique: BeastLoopDeps['critique'];
    governor: BeastLoopDeps['governor'];
    observer: IObserverModule;  // existing observer — wrapped by adapter
    logger: BeastLoopDeps['logger'];
    graphBuilder?: BeastLoopDeps['graphBuilder'];
    prCreator?: BeastLoopDeps['prCreator'];
    cliExecutor?: BeastLoopDeps['cliExecutor'];
    checkpoint?: BeastLoopDeps['checkpoint'];
    refreshPlanTasks?: BeastLoopDeps['refreshPlanTasks'];
    runConfigOverrides?: BeastLoopDeps['runConfigOverrides'];
    clock?: BeastLoopDeps['clock'];
  },
): BeastLoopDeps {
  // ── 1. Brain ──────────────────────────────────────────────────────────
  const brain = config.brain?.snapshot
    ? SqliteBrain.hydrate(config.brain.snapshot, config.brain.dbPath ?? ':memory:')
    : new SqliteBrain(config.brain?.dbPath ?? ':memory:');

  // ── 2. Audit trail ────────────────────────────────────────────────────
  const auditTrail = new AuditTrail();

  // ── 3. Provider registry ──────────────────────────────────────────────
  const providers = buildProviderList(config.providers);
  const registry = new ProviderRegistry(providers, brain, {
    onProviderSwitch: (event) => {
      auditTrail.append(createAuditEvent('provider.switch', event, {
        phase: 'execution',
        provider: event.to,
      }));
    },
  });

  // ── 4. Security middleware ────────────────────────────────────────────
  const securityConfig = resolveSecurityConfig(config.security);
  const middlewareChain = buildMiddlewareChain(securityConfig);

  // ── 5. Skill manager ─────────────────────────────────────────────────
  const skillManager = new SkillManager(config.skillsDir ?? './skills');

  // ── 6. Critique chain ─────────────────────────────────────────────────
  const evaluators = buildCritiqueEvaluators(config.critique);
  if (config.critique?.evaluators?.includes('reflection')) {
    // Create ILlmClient adapter from ProviderRegistry for reflection
    const llmClient = {
      async complete(prompt: string): Promise<string> {
        const req: LlmRequest = {
          systemPrompt: '',
          messages: [{ role: 'user', content: prompt }],
        };
        let result = '';
        for await (const event of registry.execute(req)) {
          if (event.type === 'text') result += event.content;
        }
        return result;
      },
    };
    evaluators.push(new ReflectionEvaluator({ llmClient }));
  }
  const critiqueChain = new CritiqueChain(evaluators);

  // ── 7. Build adapters ─────────────────────────────────────────────────
  const firewall = new MiddlewareChainFirewallAdapter(middlewareChain);
  const memory = new SqliteBrainMemoryAdapter(brain);
  const heartbeat = new ReflectionHeartbeatAdapter(critiqueChain);
  const skills = new SkillManagerAdapter(skillManager, registry);
  const observer = new AuditTrailObserverAdapter(existingDeps.observer, auditTrail);

  // ── 8. Assemble BeastLoopDeps ─────────────────────────────────────────
  return {
    // Adapted ports (new components behind old interfaces)
    firewall,
    memory,
    heartbeat,
    skills,
    observer,

    // Passed through unchanged from caller
    planner: existingDeps.planner,
    critique: existingDeps.critique,
    governor: existingDeps.governor,
    logger: existingDeps.logger,
    graphBuilder: existingDeps.graphBuilder,
    prCreator: existingDeps.prCreator,
    cliExecutor: existingDeps.cliExecutor,
    checkpoint: existingDeps.checkpoint,
    refreshPlanTasks: existingDeps.refreshPlanTasks,
    runConfigOverrides: existingDeps.runConfigOverrides,
    clock: existingDeps.clock ?? (() => new Date()),

    // Direct access to new components (optional fields from Chunk 8.2)
    providerRegistry: registry,
    sqliteBrain: brain,
    auditTrail,
    middlewareChain,
    skillManager,
    critiqueChain,
  };
}

function buildProviderList(providerConfigs?: ProviderConfig[]): ILlmProvider[] {
  if (!providerConfigs || providerConfigs.length === 0) {
    throw new Error(
      'No providers configured. Run \'frankenbeast provider add claude\' to get started.'
    );
  }
  return providerConfigs.map((pc) => {
    switch (pc.type) {
      case 'claude-cli': return new ClaudeCliAdapter(pc);
      case 'codex-cli': return new CodexCliAdapter(pc);
      case 'gemini-cli': return new GeminiCliAdapter(pc);
      case 'anthropic-api': return new AnthropicApiAdapter(pc);
      case 'openai-api': return new OpenAiApiAdapter(pc);
      case 'gemini-api': return new GeminiApiAdapter(pc);
      default: throw new Error(`Unknown provider type: ${(pc as any).type}`);
    }
  });
}

function buildCritiqueEvaluators(critiqueConfig?: CritiqueConfig): ICritiqueEvaluator[] {
  const names = critiqueConfig?.evaluators ?? ['lint', 'test-pass'];
  return names
    .filter(n => n !== 'reflection') // handled separately above
    .map(name => {
      switch (name) {
        case 'lint': return new LintEvaluator();
        case 'test-pass': return new TestPassEvaluator();
        default: throw new Error(`Unknown evaluator: ${name}`);
      }
    });
}
```

## Intentional Breaking Change

There are no external users. We rewrite `dep-factory.ts` in place. All callers are updated in the same commit.

### What Gets Deleted

The following are **removed entirely** from `dep-factory.ts`:

| Component | Why |
|-----------|-----|
| `CliDepOptions` interface | Replaced by `RunConfig` — single config shape for all entry points |
| `CliDeps` return interface | Replaced — `createBeastDeps()` returns `BeastLoopDeps` directly; CLI-specific objects (logger, finalize, issueDeps) move to caller setup |
| `createCliDeps()` function | Renamed to `createBeastDeps()` with new signature |
| `stubFirewall`, `stubMemory`, `stubPlanner`, `stubCritique`, `stubGovernor`, `stubHeartbeat` | Replaced by adapter classes — no more stubs, real implementations always |
| `createStubSkills()` | Replaced by `SkillManagerAdapter` |
| Dynamic `import('@franken/firewall')` | Package deleted in Phase 1. Replaced by `MiddlewareChainFirewallAdapter` |
| Dynamic `import('@franken/skills')` | Package deleted in Phase 1. Replaced by `SkillManagerAdapter` |
| Dynamic `import('franken-brain')` | Replaced by `SqliteBrainMemoryAdapter` wrapping `SqliteBrain` |
| Dynamic `import('@franken/critique')` | Wiring moves to `CritiqueChain` construction |
| Dynamic `import('@franken/governor')` | Governor module is retained — this import stays, but wiring simplifies |
| `FirewallPortAdapter`, `SkillsPortAdapter`, `EpisodicMemoryPortAdapter`, `CritiquePortAdapter`, `SkillRegistryBridge` | Old port adapters replaced by new consolidation adapters |
| `CliLlmAdapter`, `AdapterLlmClient`, `CachedCliLlmClient` construction | Replaced by `ProviderRegistry` — single LLM access point |

### Callers That Must Be Updated

| File | Current Call | Required Change |
|------|-------------|-----------------|
| `src/cli/run.ts:184` | `createCliDeps(chatDepOpts)` | Refactor to build `RunConfig` + call `createBeastDeps()` |
| `src/cli/session.ts:112` | `createCliDeps({...})` | Same — extract CLI-specific setup (logger, traceViewer, issueDeps) to session.ts |
| `src/cli/session.ts:193` | `createCliDeps(interviewOpts)` | Same |
| `src/cli/session.ts:274` | `createCliDeps(depOptions)` | Same |
| `src/cli/session.ts:350` | `createCliDeps(this.buildDepOptions())` | Same |

### What Moves (Not Deleted)

CLI-specific setup that currently lives inside `createCliDeps()` but isn't dep-factory's job:

| Component | Moves To |
|-----------|----------|
| `BeastLogger` construction | Caller (`session.ts` / `run.ts`) |
| `CliObserverBridge` setup | Caller |
| `FileCheckpointStore` / session stores | Caller |
| `MartinLoop` / `GitBranchIsolator` / `CliSkillExecutor` | Passed through as `existingDeps` |
| `PrCreator` construction | Caller |
| Issue pipeline deps (`IssueFetcher`, `IssueRunner`, etc.) | Caller (`session.ts`) |
| `setupTraceViewer()` | Caller |
| Governor readline wiring | Caller |
| `finalize()` cleanup function | Caller |

The dep-factory becomes a focused function: take config → construct consolidation components → wrap in adapters → return `BeastLoopDeps`. Everything CLI-specific lives in the callers.

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/beasts/dep-factory.test.ts

describe('createBeastDeps()', () => {
  const minimalConfig: RunConfig = {
    providers: [{ name: 'test', type: 'claude-cli' }],
  };

  const mockExistingDeps = {
    planner: createMockPlanner(),
    critique: createMockCritique(),
    governor: createMockGovernor(),
    observer: createMockObserver(),
    logger: createMockLogger(),
  };

  it('creates SqliteBrain with default :memory: path', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.sqliteBrain).toBeInstanceOf(SqliteBrain);
  });

  it('hydrates SqliteBrain from snapshot when provided', () => {
    const snapshot = createTestSnapshot();
    const deps = createBeastDeps(
      { ...minimalConfig, brain: { snapshot } },
      mockExistingDeps,
    );
    expect(deps.sqliteBrain).toBeInstanceOf(SqliteBrain);
  });

  it('builds ProviderRegistry from config', () => {
    const deps = createBeastDeps({
      ...minimalConfig,
      providers: [
        { name: 'primary', type: 'claude-cli' },
        { name: 'fallback', type: 'anthropic-api', apiKey: 'test-key' },
      ],
    }, mockExistingDeps);
    expect(deps.providerRegistry).toBeInstanceOf(ProviderRegistry);
    expect(deps.providerRegistry!.getProviders()).toHaveLength(2);
  });

  it('throws helpful error when no providers configured', () => {
    expect(() => createBeastDeps(
      { providers: [] },
      mockExistingDeps,
    )).toThrow(/frankenbeast provider add/);
  });

  it('wires onProviderSwitch callback to audit trail', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    // Trigger provider switch via registry, verify auditTrail.append called
  });

  it('builds MiddlewareChain from security profile', () => {
    const deps = createBeastDeps({
      ...minimalConfig,
      security: { profile: 'strict' },
    }, mockExistingDeps);
    expect(deps.middlewareChain).toBeDefined();
  });

  it('adapts MiddlewareChain to IFirewallModule', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.firewall).toBeInstanceOf(MiddlewareChainFirewallAdapter);
  });

  it('adapts SqliteBrain to IMemoryModule', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.memory).toBeInstanceOf(SqliteBrainMemoryAdapter);
  });

  it('adapts CritiqueChain to IHeartbeatModule', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.heartbeat).toBeInstanceOf(ReflectionHeartbeatAdapter);
  });

  it('adapts SkillManager to ISkillsModule', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.skills).toBeInstanceOf(SkillManagerAdapter);
  });

  it('wraps existing observer with AuditTrailObserverAdapter', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.observer).toBeInstanceOf(AuditTrailObserverAdapter);
  });

  it('includes ReflectionEvaluator when configured', () => {
    const deps = createBeastDeps({
      ...minimalConfig,
      critique: { evaluators: ['lint', 'reflection'] },
    }, mockExistingDeps);
    expect(deps.critiqueChain!.hasEvaluator('reflection')).toBe(true);
  });

  it('passes through existing deps unchanged', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.planner).toBe(mockExistingDeps.planner);
    expect(deps.critique).toBe(mockExistingDeps.critique);
    expect(deps.governor).toBe(mockExistingDeps.governor);
    expect(deps.logger).toBe(mockExistingDeps.logger);
  });

  it('creates SkillManager with configured directory', () => {
    const deps = createBeastDeps({
      ...minimalConfig,
      skillsDir: '/custom/skills',
    }, mockExistingDeps);
    expect(deps.skillManager).toBeInstanceOf(SkillManager);
  });

  it('creates AuditTrail', () => {
    const deps = createBeastDeps(minimalConfig, mockExistingDeps);
    expect(deps.auditTrail).toBeInstanceOf(AuditTrail);
  });
});
```

## Files

- **Modify:** `packages/franken-orchestrator/src/cli/run-config-loader.ts` — add consolidation fields to RunConfig
- **Rewrite:** `packages/franken-orchestrator/src/cli/dep-factory.ts` — delete `createCliDeps()` + all stubs + old port adapters, replace with focused `createBeastDeps()`
- **Modify:** `packages/franken-orchestrator/src/cli/session.ts` — extract CLI-specific setup (logger, observer, executor, issues, finalize) from old dep-factory into caller
- **Modify:** `packages/franken-orchestrator/src/cli/run.ts` — same extraction for chat mode
- **Rewrite:** `packages/franken-orchestrator/tests/unit/beasts/dep-factory.test.ts` — new tests for `createBeastDeps()`
- **Delete:** Old adapter files no longer needed: `firewall-adapter.ts`, `skills-adapter.ts`, `episodic-memory-port-adapter.ts`, `critique-adapter.ts`, `skill-registry-bridge.ts`

## Exit Criteria

- `createBeastDeps()` produces a valid `BeastLoopDeps` with all 18+ fields populated
- Adapted ports: firewall → MiddlewareChainFirewallAdapter, memory → SqliteBrainMemoryAdapter, heartbeat → ReflectionHeartbeatAdapter, skills → SkillManagerAdapter, observer → AuditTrailObserverAdapter
- Direct access: `providerRegistry`, `sqliteBrain`, `auditTrail`, `middlewareChain`, `skillManager`, `critiqueChain` available as optional fields
- Provider list built from RunConfig with type-safe adapter mapping
- Helpful error message when no providers configured
- `onProviderSwitch` callback wired to audit trail
- **No references to `createCliDeps`, `CliDepOptions`, or `CliDeps`** anywhere in the codebase
- **No stubs** (`stubFirewall`, `stubMemory`, etc.) — all ports backed by real adapter classes
- **No old port adapters** (`FirewallPortAdapter`, `SkillsPortAdapter`, `EpisodicMemoryPortAdapter`, `CritiquePortAdapter`, `SkillRegistryBridge`) — deleted
- All callers (`session.ts`, `run.ts`) updated and working
- All tests pass
