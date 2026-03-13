# BeastLoop Tiers 1-2 Wiring: Firewall + Skills + Memory

**Date:** 2026-03-12
**Status:** Implemented
**Branch:** `feat/beastloop-tiers-1-2-wiring`

## Problem

The CLI BeastLoop in `dep-factory.ts` stubs out 6 of 7 module ports. Firewall, Skills, and Memory (Tiers 1-2) are the foundation — every loop iteration passes input through Firewall, selects work via Skills, and reads/writes context via Memory. Without real implementations, the loop is a passthrough that can't enforce guardrails, discover skills, or remember anything across runs.

## Approach

Direct module instantiation in `createCliDeps()` (Approach A). Each stub is replaced with its real `*PortAdapter` wired to the actual module package. No factory indirection, no feature flags. If a module's external dependency (e.g., SQLite for Memory) fails to initialize, fall back to the existing stub with a warning log.

## Scope

Three modules, all in `packages/franken-orchestrator`:

| Module | Adapter | Real Package | External Dep |
|--------|---------|-------------|-------------|
| Firewall | `FirewallPortAdapter` | `@frankenbeast/firewall` | None (in-process) |
| Skills | `SkillsPortAdapter` | `@frankenbeast/skills` | `@djm204/agent-skills` CLI (for global skill discovery via `sync()`) |
| Memory | New `EpisodicMemoryPortAdapter` | `@frankenbeast/brain` | `better-sqlite3` |

## Detailed Design

### 1. Firewall Wiring

**Current:** `stubFirewall` returns input unchanged, no violations, never blocks.

**Target:** `FirewallPortAdapter` from `src/adapters/firewall-adapter.ts`.

**Constructor signature:**
```typescript
new FirewallPortAdapter(deps: FirewallPortAdapterDeps)
```

**`FirewallPortAdapterDeps` requires:**
- `runPipeline` — the `runPipeline()` function from `@frankenbeast/firewall`
- `adapter` — a provider-specific adapter (e.g., `ClaudeAdapter`)
- `config` — a `GuardrailsConfig` object
- `provider` — provider string (e.g., `'anthropic'`)
- `model` — model string (matches the CLI adapter's model)

**Type bridging note:** `FirewallPortAdapter` defines its own local types (`FirewallUnifiedRequest`, `FirewallAdapterPort`) as an anti-corruption layer. The frankenfirewall package uses `UnifiedRequest` and `IAdapter`. These are structurally compatible for the fields we use, but the `runPipeline` and `adapter` arguments will be passed with type assertions (`as unknown as`) at the wiring boundary. This is intentional — the adapter's local types decouple the orchestrator from frankenfirewall's internal type evolution.

**Wiring in `createCliDeps()`:**
```typescript
import { runPipeline, ClaudeAdapter } from '@frankenbeast/firewall';
import { FirewallPortAdapter } from '../adapters/firewall-adapter.js';
import type { GuardrailsConfig } from '@frankenbeast/firewall';
import type { FirewallPortAdapterDeps } from '../adapters/firewall-adapter.js';

const firewallConfig: GuardrailsConfig = {
  project_name: basename(paths.root),
  security_tier: options.firewallSecurityTier ?? 'MODERATE',
  schema_version: 1,
  agnostic_settings: {
    redact_pii: false,
    max_token_spend_per_call: budget,
    allowed_providers: ['anthropic'],
  },
  safety_hooks: { pre_flight: [], post_flight: [] },
};

const firewall = new FirewallPortAdapter({
  runPipeline: runPipeline as unknown as FirewallPortAdapterDeps['runPipeline'],
  adapter: new ClaudeAdapter() as unknown as FirewallPortAdapterDeps['adapter'],
  config: firewallConfig,
  provider: 'anthropic',
  model: options.adapterModel ?? 'claude-sonnet-4-6',
});
```

**Config surface:** `CliDepOptions` gains optional `firewallSecurityTier?: 'STRICT' | 'MODERATE' | 'PERMISSIVE'` (default `'MODERATE'`).

**Fallback:** If `FirewallPortAdapter` construction throws, log a warning and use `stubFirewall`.

### 2. Skills Wiring

**Current:** `createStubSkills()` reads chunk filenames from the plan directory and returns them as `cli:` prefixed skill descriptors. No real registry, no LLM execution, no MCP.

**Target:** `SkillsPortAdapter` from `src/adapters/skills-adapter.ts`.

**Constructor signature:**
```typescript
new SkillsPortAdapter(registry: SkillRegistryPort, llmClient: ILlmClient, mcp?: IMcpModule)
```

**Interface gap:** `SkillsPortAdapter` expects `SkillRegistryPort` (methods: `hasSkill`, `getSkill`, `getAll` returning `SkillContract[]`). The real `ISkillRegistry` from `@frankenbeast/skills` has the same method names but returns `UnifiedSkillContract` (which includes additional fields like `interface`, `constraints.is_destructive`, `constraints.sandbox_type`, `metadata.description`, `metadata.source`). A bridge adapter maps the richer type to the simpler `SkillContract`.

**Initialization requirement:** `ISkillRegistry.sync()` must be called before any reads, or all calls throw `REGISTRY_NOT_SYNCED`. This is an async operation that discovers skills from the filesystem and `@djm204/agent-skills` CLI. If `sync()` fails (e.g., CLI not installed), the fallback kicks in.

**New file: `src/adapters/skill-registry-bridge.ts`**
```typescript
import type { ISkillRegistry } from '@frankenbeast/skills';
import type { SkillRegistryPort, SkillContract } from './skills-adapter.js';

export class SkillRegistryBridge implements SkillRegistryPort {
  constructor(private readonly registry: ISkillRegistry) {}

  hasSkill(id: string): boolean {
    return this.registry.hasSkill(id);
  }

  getSkill(id: string): SkillContract | undefined {
    const skill = this.registry.getSkill(id);
    if (!skill) return undefined;
    return this.toContract(skill);
  }

  getAll(): readonly SkillContract[] {
    return this.registry.getAll().map(s => this.toContract(s));
  }

  private toContract(skill: {
    skill_id: string;
    metadata: { name: string };
    constraints: { requires_hitl: boolean };
  }): SkillContract {
    return {
      skill_id: skill.skill_id,
      metadata: { name: skill.metadata.name },
      constraints: { requires_hitl: skill.constraints.requires_hitl },
    };
  }
}
```

**Wiring in `createCliDeps()`:**
```typescript
import { createRegistry } from '@frankenbeast/skills';
import { SkillsPortAdapter } from '../adapters/skills-adapter.js';
import { SkillRegistryBridge } from '../adapters/skill-registry-bridge.js';

const skillsRegistry = createRegistry({
  localSkillsDir: options.skillsDir ?? resolve(paths.root, 'skills'),
});
await skillsRegistry.sync();
const registryBridge = new SkillRegistryBridge(skillsRegistry);
const skills = new SkillsPortAdapter(registryBridge, adapterLlm);
```

**Backward compatibility:** The existing `createStubSkills()` chunk-file enumeration is still useful for plan-based execution. The `cliExecutor` handles chunk execution independently of the skills module — no functionality is lost.

**Fallback:** If `createRegistry()` or `sync()` throws, log a warning and use `createStubSkills()`.

### 3. Memory Wiring

**Current:** `stubMemory` — in-memory, no persistence, empty context.

**Target:** New `EpisodicMemoryPortAdapter` that bridges `EpisodicMemoryStore` from `@frankenbeast/brain` to the `IMemoryModule` port.

**Why a new adapter:** The existing `MemoryPortAdapter` is itself a stub (in-memory array, static context) and is retained as-is for fallback use. The `MemoryOrchestrator` from franken-brain requires a semantic store and compression strategy that add complexity we don't need yet. Direct bridging to `EpisodicMemoryStore` is simpler and sufficient for Tier 2.

**Type bridging:** The orchestrator's `EpisodicEntry` (`{taskId, summary, outcome: 'success'|'failure', timestamp: string}`) is structurally different from the brain's `EpisodicTrace` (`{id, projectId, status: MemoryStatus, createdAt: number, type: 'episodic', taskId, toolName?, input, output}`). The adapter must:
- Generate `id` (via `generateId()` from `@frankenbeast/brain`)
- Set `projectId` from constructor deps
- Map `outcome` → `status` ('success'/'failure' are valid `MemoryStatus` values)
- Convert `timestamp` (ISO string) → `createdAt` (epoch ms via `Date.parse()`)
- Set `type: 'episodic'`
- Map `summary` → `input` (as the trace payload), set `output: null`

For reading, `queryFailed(projectId)` returns `EpisodicTrace[]` with `status === 'failure'`. We extract summaries from the `input` field.

**New file: `src/adapters/episodic-memory-port-adapter.ts`**
```typescript
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IMemoryModule, MemoryContext, EpisodicEntry } from '../deps.js';
import type { IEpisodicStore, EpisodicTrace } from '@frankenbeast/brain';
import { generateId } from '@frankenbeast/brain';

export interface EpisodicMemoryPortAdapterDeps {
  episodicStore: IEpisodicStore;
  projectId: string;
  projectRoot: string;
}

export class EpisodicMemoryPortAdapter implements IMemoryModule {
  private cachedAdrs: string[] = [];
  private readonly deps: EpisodicMemoryPortAdapterDeps;

  constructor(deps: EpisodicMemoryPortAdapterDeps) {
    this.deps = deps;
  }

  async frontload(_projectId: string): Promise<void> {
    this.cachedAdrs = this.scanAdrs();
  }

  async getContext(_projectId: string): Promise<MemoryContext> {
    const failedTraces = this.deps.episodicStore.queryFailed(this.deps.projectId);
    const knownErrors = failedTraces.map(t =>
      typeof t.input === 'string' ? t.input : JSON.stringify(t.input),
    );

    return {
      adrs: this.cachedAdrs,
      knownErrors,
      rules: [],
    };
  }

  async recordTrace(trace: EpisodicEntry): Promise<void> {
    const episodicTrace: EpisodicTrace = {
      id: generateId(),
      type: 'episodic',
      projectId: this.deps.projectId,
      status: trace.outcome,
      createdAt: Date.parse(trace.timestamp) || Date.now(),
      taskId: trace.taskId,
      input: trace.summary,
      output: null,
    };
    this.deps.episodicStore.record(episodicTrace);
  }

  private scanAdrs(): string[] {
    const adrDir = resolve(this.deps.projectRoot, 'docs', 'adr');
    try {
      return readdirSync(adrDir)
        .filter(f => f.endsWith('.md'))
        .sort();
    } catch {
      return [];
    }
  }
}
```

**Wiring in `createCliDeps()`:**

`better-sqlite3` is used via dynamic `import()` so that the fallback works even if the native module is not installed (static import would fail at module resolution before the try/catch runs).

```typescript
try {
  const { default: Database } = await import('better-sqlite3');
  const { EpisodicMemoryStore } = await import('@frankenbeast/brain');
  const { EpisodicMemoryPortAdapter } = await import('../adapters/episodic-memory-port-adapter.js');

  const memoryDbPath = resolve(paths.buildDir, 'memory.db');
  const memoryDb = new Database(memoryDbPath);
  const episodicStore = new EpisodicMemoryStore(memoryDb);
  memory = new EpisodicMemoryPortAdapter({
    episodicStore,
    projectId: basename(paths.root),
    projectRoot: paths.root,
  });
} catch (error) {
  logger.warn(`Memory module unavailable, using stub: ${errorMessage(error)}`, 'dep-factory');
  memory = stubMemory;
}
```

**Reset handling:** When `options.reset` is true, delete `memory.db` alongside the existing checkpoint and traces cleanup.

### 4. CliDepOptions Changes

```typescript
export interface CliDepOptions {
  // ... existing fields ...

  /** Security tier for firewall guardrails. Default: 'MODERATE'. */
  firewallSecurityTier?: 'STRICT' | 'MODERATE' | 'PERMISSIVE';

  /** Directory containing project-local skills. Default: <root>/skills */
  skillsDir?: string;
}
```

CLI flag plumbing for these new options is deferred — they can be set via `.frankenbeast/config.json` or programmatic callers. The CLI commands will gain flags in a follow-up.

### 5. Fallback Strategy

Each module is constructed in a try/catch. On failure:
1. Log a warning via `logger.warn()` with the error message
2. Fall back to the existing stub
3. The loop continues — degraded but functional

For Skills, `sync()` failure also triggers fallback. For Memory, `better-sqlite3` is dynamically imported so a missing native module is caught.

This means the CLI never crashes due to a module initialization failure.

### 6. Testing Strategy

**Unit tests** (`tests/unit/cli/dep-factory-modules.test.ts`):
- Firewall: `FirewallPortAdapter` calls `runPipeline` and maps violations correctly
- Skills: `SkillRegistryBridge` correctly adapts `ISkillRegistry` to `SkillRegistryPort` — verifies `hasSkill()`, `getSkill()`, `getAll()` delegation
- Memory: `EpisodicMemoryPortAdapter` maps `EpisodicEntry` → `EpisodicTrace` correctly (id generation, status mapping, timestamp conversion), reads failures via `queryFailed()`, scans ADRs from filesystem

**Integration test** (`tests/integration/cli/dep-factory-wiring.test.ts`):
- Call `createCliDeps()` with real module packages available, verify `deps.firewall` is `FirewallPortAdapter` (not stub)
- Call `createCliDeps()` with module construction forced to fail, verify fallback to stubs

### 7. Files Changed

| File | Change |
|------|--------|
| `src/cli/dep-factory.ts` | Replace 3 stubs with real module construction + fallback |
| `src/adapters/skill-registry-bridge.ts` | **New** — bridges `ISkillRegistry` to `SkillRegistryPort` |
| `src/adapters/episodic-memory-port-adapter.ts` | **New** — bridges `EpisodicMemoryStore` to `IMemoryModule` |
| `tests/unit/cli/dep-factory-modules.test.ts` | **New** — unit tests for all 3 wirings |
| `tests/integration/cli/dep-factory-wiring.test.ts` | **New** — integration test for wiring + fallback |

### 8. Per-Agent Module Configuration

Each beast agent in the dashboard can toggle individual modules on/off. When a module is disabled for an agent, the stub is used instead of the real implementation. This makes each agent modular — an agent that only needs firewall + memory can disable skills, critique, governor, and heartbeat.

#### 8.1 ModuleConfig Type

```typescript
// src/beasts/types.ts (add to existing types)
export interface ModuleConfig {
  readonly firewall?: boolean;   // default: true
  readonly skills?: boolean;     // default: true
  readonly memory?: boolean;     // default: true
  readonly planner?: boolean;    // default: true
  readonly critique?: boolean;   // default: true
  readonly governor?: boolean;   // default: true
  readonly heartbeat?: boolean;  // default: true
}
```

#### 8.2 TrackedAgent Module Config

Module toggles are stored on the `TrackedAgent` as a universal field (not per-definition):

```typescript
// In TrackedAgent (agent-types.ts)
readonly moduleConfig?: ModuleConfig | undefined;
```

The dashboard renders toggle switches for each module when creating/editing an agent. When a run is dispatched from an agent, the `moduleConfig` is merged into the run's environment.

#### 8.3 BeastDefinition Process Spec

`buildProcessSpec()` receives module config and passes it as env vars:

```typescript
// Universal env vars set by ProcessBeastExecutor before spawning
FRANKENBEAST_MODULE_FIREWALL=true|false
FRANKENBEAST_MODULE_SKILLS=true|false
FRANKENBEAST_MODULE_MEMORY=true|false
FRANKENBEAST_MODULE_CRITIQUE=true|false
FRANKENBEAST_MODULE_GOVERNOR=true|false
FRANKENBEAST_MODULE_HEARTBEAT=true|false
```

The `ProcessBeastExecutor.start()` method reads `moduleConfig` from the tracked agent and injects these env vars into the process spec's `env` — this is universal, not per-definition.

#### 8.4 CliDepOptions Integration

```typescript
export interface CliDepOptions {
  // ... existing fields ...

  /** Per-module enable/disable. Defaults to all enabled. Read from env vars if not set. */
  enabledModules?: ModuleConfig;
}
```

At the top of `createCliDeps()`, resolve the effective module config:

```typescript
const modules: Required<ModuleConfig> = {
  firewall: options.enabledModules?.firewall ?? (process.env.FRANKENBEAST_MODULE_FIREWALL !== 'false'),
  skills: options.enabledModules?.skills ?? (process.env.FRANKENBEAST_MODULE_SKILLS !== 'false'),
  memory: options.enabledModules?.memory ?? (process.env.FRANKENBEAST_MODULE_MEMORY !== 'false'),
  planner: options.enabledModules?.planner ?? (process.env.FRANKENBEAST_MODULE_PLANNER !== 'false'),
  critique: options.enabledModules?.critique ?? (process.env.FRANKENBEAST_MODULE_CRITIQUE !== 'false'),
  governor: options.enabledModules?.governor ?? (process.env.FRANKENBEAST_MODULE_GOVERNOR !== 'false'),
  heartbeat: options.enabledModules?.heartbeat ?? (process.env.FRANKENBEAST_MODULE_HEARTBEAT !== 'false'),
};
```

Each module wiring block is then gated:

```typescript
let firewall: IFirewallModule = stubFirewall;
if (modules.firewall) {
  try {
    // ... real wiring ...
  } catch (error) {
    logger.warn(`Firewall module unavailable, using stub: ${errorMessage(error)}`, 'dep-factory');
  }
}
```

When `modules.firewall` is `false`, the real wiring is never attempted — the stub is used unconditionally. This is distinct from the try/catch fallback (which handles construction failures). The toggle is an explicit operator choice; the fallback is a safety net.

#### 8.5 Dashboard Integration (franken-web)

The beast dispatch page in `franken-web` renders module toggle switches per agent:

- Default: all modules enabled (toggles ON)
- Each toggle maps to a field in `moduleConfig`
- Toggles are stored on the `TrackedAgent` and persisted to SQLite
- The API route `POST /v1/beasts/agents` accepts `moduleConfig` in the request body
- The API route `PATCH /v1/beasts/agents/:agentId` allows updating `moduleConfig`
- Toggle state is displayed in the agent detail view

Dashboard UI implementation is in `packages/franken-web/` and is out of scope for the orchestrator wiring plan. The orchestrator changes (types, env vars, CliDepOptions) are the foundation that the dashboard consumes.

#### 8.6 Flow Summary

```
Dashboard toggle → TrackedAgent.moduleConfig → ProcessBeastExecutor
  → FRANKENBEAST_MODULE_* env vars → createCliDeps() → modules config
  → if disabled: stub | if enabled: try real wiring, catch → stub
```

### 9. Out of Scope

- Semantic memory (Chroma) — deferred to a later tier
- `MemoryOrchestrator` — requires semantic store, deferred
- PII guard — deferred to Tier 3-4 (Critique handles content review)
- Multi-provider firewall adapters — only Claude adapter wired initially
- MCP integration in skills — deferred until MCP server registry is ready
- CLI flag plumbing for new `CliDepOptions` fields — follow-up
