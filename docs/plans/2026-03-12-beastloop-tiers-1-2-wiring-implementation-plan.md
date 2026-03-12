# BeastLoop Tiers 1-2 Wiring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 stub modules (Firewall, Skills, Memory) in `dep-factory.ts` with real module wiring, with graceful fallback to stubs on failure.

**Architecture:** Direct module instantiation in `createCliDeps()`. Each module's `*PortAdapter` is constructed with real dependencies from the corresponding package. A try/catch around each construction falls back to the existing stub. Two new adapter files bridge interface gaps (SkillRegistryBridge, EpisodicMemoryPortAdapter).

**Tech Stack:** TypeScript, Vitest, better-sqlite3, `@franken/firewall`, `@franken/skills`, `franken-brain`

**Spec:** `docs/plans/2026-03-12-beastloop-tiers-1-2-wiring-design.md`

**Important package names** (workspace names, not npm scoped):
- Firewall: `@franken/firewall` (not `@frankenbeast/firewall`)
- Skills: `@franken/skills` (not `@frankenbeast/skills`)
- Brain: `franken-brain` (not `@frankenbeast/brain`)

---

## File Structure

| File | Role |
|------|------|
| `src/adapters/skill-registry-bridge.ts` | **New** — Bridges `ISkillRegistry` (`@franken/skills`) → `SkillRegistryPort` (local) |
| `src/adapters/episodic-memory-port-adapter.ts` | **New** — Bridges `EpisodicMemoryStore` (`franken-brain`) → `IMemoryModule` (local) |
| `src/cli/dep-factory.ts` | **Modify** — Replace 3 stubs with real construction + fallback |
| `tests/unit/adapters/skill-registry-bridge.test.ts` | **New** — Unit tests for the bridge |
| `tests/unit/adapters/episodic-memory-port-adapter.test.ts` | **New** — Unit tests for memory adapter |
| `tests/integration/cli/dep-factory-wiring.test.ts` | **New** — Integration test for real wiring + fallback |

All paths relative to `packages/franken-orchestrator/`.

---

## Chunk 1: Workspace dependencies + SkillRegistryBridge

### Task 1: Add workspace dependencies

**Files:**
- Modify: `packages/franken-orchestrator/package.json`

- [ ] **Step 1: Add missing workspace dependencies**

Add `@franken/firewall`, `@franken/skills`, and `franken-brain` to `dependencies` in `packages/franken-orchestrator/package.json`. The orchestrator already has `better-sqlite3` and `@frankenbeast/observer`.

```json
"@franken/firewall": "*",
"@franken/skills": "*",
"franken-brain": "*",
```

- [ ] **Step 2: Install dependencies**

Run: `cd /home/pfk/dev/frankenbeast && npm install`
Expected: Successful install linking workspace packages

- [ ] **Step 3: Commit**

```bash
git add packages/franken-orchestrator/package.json package-lock.json
git commit -m "chore: add firewall, skills, brain workspace deps to orchestrator"
```

### Task 2: SkillRegistryBridge — failing tests

**Files:**
- Create: `tests/unit/adapters/skill-registry-bridge.test.ts`

- [ ] **Step 4: Write the failing test file**

```typescript
// tests/unit/adapters/skill-registry-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { SkillRegistryBridge } from '../../../src/adapters/skill-registry-bridge.js';

interface TestContract {
  skill_id: string;
  metadata: { name: string; description: string; source: string };
  interface: { input_schema: Record<string, unknown>; output_schema: Record<string, unknown> };
  constraints: { is_destructive: boolean; requires_hitl: boolean; sandbox_type: string };
}

function fakeRegistry(skills: TestContract[] = []) {
  return {
    hasSkill: (id: string) => skills.some(s => s.skill_id === id),
    getSkill: (id: string) => skills.find(s => s.skill_id === id),
    getAll: () => skills,
    sync: async () => {},
    isSynced: () => true,
  };
}

const testSkill: TestContract = {
  skill_id: 'test-skill',
  metadata: { name: 'Test Skill', description: 'A test', source: 'LOCAL' },
  interface: { input_schema: {}, output_schema: {} },
  constraints: { is_destructive: false, requires_hitl: true, sandbox_type: 'LOCAL' },
};

describe('SkillRegistryBridge', () => {
  it('delegates hasSkill to the underlying registry', () => {
    const bridge = new SkillRegistryBridge(fakeRegistry([testSkill]));

    expect(bridge.hasSkill('test-skill')).toBe(true);
    expect(bridge.hasSkill('missing')).toBe(false);
  });

  it('maps getSkill to a SkillContract with only the fields the adapter needs', () => {
    const bridge = new SkillRegistryBridge(fakeRegistry([testSkill]));
    const result = bridge.getSkill('test-skill');

    expect(result).toEqual({
      skill_id: 'test-skill',
      metadata: { name: 'Test Skill' },
      constraints: { requires_hitl: true },
    });
  });

  it('returns undefined for unknown skills', () => {
    const bridge = new SkillRegistryBridge(fakeRegistry([]));

    expect(bridge.getSkill('missing')).toBeUndefined();
  });

  it('maps getAll to SkillContract array', () => {
    const second: TestContract = {
      ...testSkill,
      skill_id: 'second',
      metadata: { ...testSkill.metadata, name: 'Second' },
      constraints: { ...testSkill.constraints, requires_hitl: false },
    };
    const bridge = new SkillRegistryBridge(fakeRegistry([testSkill, second]));
    const all = bridge.getAll();

    expect(all).toHaveLength(2);
    expect(all[0]).toEqual({
      skill_id: 'test-skill',
      metadata: { name: 'Test Skill' },
      constraints: { requires_hitl: true },
    });
    expect(all[1]).toEqual({
      skill_id: 'second',
      metadata: { name: 'Second' },
      constraints: { requires_hitl: false },
    });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/adapters/skill-registry-bridge.test.ts`
Expected: FAIL — cannot resolve `../../../src/adapters/skill-registry-bridge.js`

### Task 3: SkillRegistryBridge — implementation

**Files:**
- Create: `src/adapters/skill-registry-bridge.ts`

- [ ] **Step 6: Write the SkillRegistryBridge**

```typescript
// src/adapters/skill-registry-bridge.ts
import type { SkillRegistryPort, SkillContract } from './skills-adapter.js';

export interface BridgeableSkillRegistry {
  hasSkill(id: string): boolean;
  getSkill(id: string): BridgeableSkillContract | undefined;
  getAll(): BridgeableSkillContract[];
}

interface BridgeableSkillContract {
  readonly skill_id: string;
  readonly metadata: { readonly name: string };
  readonly constraints: { readonly requires_hitl: boolean };
}

export class SkillRegistryBridge implements SkillRegistryPort {
  constructor(private readonly registry: BridgeableSkillRegistry) {}

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

  private toContract(skill: BridgeableSkillContract): SkillContract {
    return {
      skill_id: skill.skill_id,
      metadata: { name: skill.metadata.name },
      constraints: { requires_hitl: skill.constraints.requires_hitl },
    };
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/adapters/skill-registry-bridge.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 8: Commit**

```bash
git add packages/franken-orchestrator/src/adapters/skill-registry-bridge.ts packages/franken-orchestrator/tests/unit/adapters/skill-registry-bridge.test.ts
git commit -m "feat: add SkillRegistryBridge to adapt ISkillRegistry to SkillRegistryPort"
```

---

## Chunk 2: EpisodicMemoryPortAdapter

### Task 4: EpisodicMemoryPortAdapter — failing tests

**Files:**
- Create: `tests/unit/adapters/episodic-memory-port-adapter.test.ts`

Tests use `EpisodicStorePort` from the adapter's own local type (anti-corruption layer), not from `franken-brain` directly.

- [ ] **Step 9: Write the failing test file**

```typescript
// tests/unit/adapters/episodic-memory-port-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodicMemoryPortAdapter } from '../../../src/adapters/episodic-memory-port-adapter.js';
import type { EpisodicStorePort } from '../../../src/adapters/episodic-memory-port-adapter.js';

type TraceRecord = Parameters<EpisodicStorePort['record']>[0];
type TraceResult = ReturnType<EpisodicStorePort['queryFailed']>[number];

function createFakeStore() {
  const traces: TraceRecord[] = [];
  return {
    record: vi.fn((trace: TraceRecord) => {
      traces.push(trace);
      return trace.id;
    }),
    queryFailed: vi.fn((_projectId: string): TraceResult[] =>
      traces.filter(t => t.status === 'failure') as TraceResult[],
    ),
    _traces: traces,
  };
}

describe('EpisodicMemoryPortAdapter', () => {
  let store: ReturnType<typeof createFakeStore>;
  let adapter: EpisodicMemoryPortAdapter;

  beforeEach(() => {
    store = createFakeStore();
    adapter = new EpisodicMemoryPortAdapter({
      episodicStore: store,
      projectId: 'test-project',
      projectRoot: '/tmp/nonexistent-project',
    });
  });

  describe('recordTrace', () => {
    it('converts EpisodicEntry to EpisodicTrace and calls store.record', async () => {
      await adapter.recordTrace({
        taskId: 'task-1',
        summary: 'Built the widget',
        outcome: 'success',
        timestamp: '2026-03-12T10:00:00.000Z',
      });

      expect(store.record).toHaveBeenCalledOnce();
      const recorded = store.record.mock.calls[0][0];
      expect(recorded.type).toBe('episodic');
      expect(recorded.projectId).toBe('test-project');
      expect(recorded.taskId).toBe('task-1');
      expect(recorded.status).toBe('success');
      expect(recorded.createdAt).toBe(Date.parse('2026-03-12T10:00:00.000Z'));
      expect(recorded.input).toBe('Built the widget');
      expect(recorded.output).toBeNull();
      expect(recorded.id).toBeTruthy();
    });

    it('maps failure outcome to failure status', async () => {
      await adapter.recordTrace({
        taskId: 'task-2',
        summary: 'Crashed',
        outcome: 'failure',
        timestamp: '2026-03-12T11:00:00.000Z',
      });

      const recorded = store.record.mock.calls[0][0];
      expect(recorded.status).toBe('failure');
    });

    it('falls back to Date.now() for invalid timestamps', async () => {
      const before = Date.now();
      await adapter.recordTrace({
        taskId: 'task-3',
        summary: 'Bad time',
        outcome: 'success',
        timestamp: 'not-a-date',
      });

      const recorded = store.record.mock.calls[0][0];
      expect(recorded.createdAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getContext', () => {
    it('returns failed traces as knownErrors', async () => {
      store.queryFailed.mockReturnValue([
        {
          id: 'trace-1',
          type: 'episodic' as const,
          projectId: 'test-project',
          taskId: 'task-1',
          status: 'failure',
          createdAt: Date.now(),
          input: 'Widget build failed',
          output: null,
        },
      ]);

      const ctx = await adapter.getContext('test-project');

      expect(store.queryFailed).toHaveBeenCalledWith('test-project');
      expect(ctx.knownErrors).toEqual(['Widget build failed']);
      expect(ctx.rules).toEqual([]);
    });

    it('stringifies non-string input in knownErrors', async () => {
      store.queryFailed.mockReturnValue([
        {
          id: 'trace-2',
          type: 'episodic' as const,
          projectId: 'test-project',
          taskId: 'task-2',
          status: 'failure',
          createdAt: Date.now(),
          input: { error: 'timeout' },
          output: null,
        },
      ]);

      const ctx = await adapter.getContext('test-project');

      expect(ctx.knownErrors).toEqual(['{"error":"timeout"}']);
    });
  });

  describe('frontload', () => {
    it('returns empty adrs when docs/adr does not exist', async () => {
      await adapter.frontload('test-project');
      const ctx = await adapter.getContext('test-project');

      expect(ctx.adrs).toEqual([]);
    });
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/adapters/episodic-memory-port-adapter.test.ts`
Expected: FAIL — cannot resolve `../../../src/adapters/episodic-memory-port-adapter.js`

### Task 5: EpisodicMemoryPortAdapter — implementation

**Files:**
- Create: `src/adapters/episodic-memory-port-adapter.ts`

- [ ] **Step 11: Write the EpisodicMemoryPortAdapter**

```typescript
// src/adapters/episodic-memory-port-adapter.ts
import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { IMemoryModule, MemoryContext, EpisodicEntry } from '../deps.js';

export interface EpisodicStorePort {
  record(trace: {
    id: string;
    type: 'episodic';
    projectId: string;
    taskId: string;
    status: string;
    createdAt: number;
    input: unknown;
    output: unknown;
  }): string | Promise<string>;
  queryFailed(projectId: string): Array<{
    id: string;
    type: 'episodic';
    projectId: string;
    taskId: string;
    status: string;
    createdAt: number;
    input: unknown;
    output: unknown;
  }>;
}

export interface EpisodicMemoryPortAdapterDeps {
  episodicStore: EpisodicStorePort;
  projectId: string;
  projectRoot: string;
  idFactory?: () => string;
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
    const id = this.deps.idFactory?.() ?? randomUUID();
    const createdAt = Date.parse(trace.timestamp);
    this.deps.episodicStore.record({
      id,
      type: 'episodic',
      projectId: this.deps.projectId,
      status: trace.outcome,
      createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
      taskId: trace.taskId,
      input: trace.summary,
      output: null,
    });
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

Note: `EpisodicStorePort` is defined locally as an anti-corruption layer (same pattern as `FirewallPortAdapter`). It is structurally compatible with `EpisodicMemoryStore` from `franken-brain` but does not import it.

- [ ] **Step 12: Run test to verify it passes**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/adapters/episodic-memory-port-adapter.test.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 13: Commit**

```bash
git add packages/franken-orchestrator/src/adapters/episodic-memory-port-adapter.ts packages/franken-orchestrator/tests/unit/adapters/episodic-memory-port-adapter.test.ts
git commit -m "feat: add EpisodicMemoryPortAdapter bridging EpisodicMemoryStore to IMemoryModule"
```

---

## Chunk 3: Wire real modules into dep-factory.ts

### Task 6: Wire Firewall in dep-factory.ts

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`

- [ ] **Step 14: Add firewall imports and CliDepOptions field**

At the top of `dep-factory.ts`, add:
```typescript
import { FirewallPortAdapter } from '../adapters/firewall-adapter.js';
import type { FirewallPortAdapterDeps } from '../adapters/firewall-adapter.js';
```

Add to `CliDepOptions`:
```typescript
/** Security tier for firewall guardrails. Default: 'MODERATE'. */
firewallSecurityTier?: 'STRICT' | 'MODERATE' | 'PERMISSIVE';
```

- [ ] **Step 15: Replace stubFirewall with real construction + fallback**

In `createCliDeps()`, after the `adapterLlm` creation and before the `deps` object, replace `stubFirewall` usage with:

```typescript
let firewall: IFirewallModule = stubFirewall;
try {
  const { runPipeline, ClaudeAdapter } = await import('@franken/firewall');
  const firewallConfig = {
    project_name: basename(paths.root),
    security_tier: options.firewallSecurityTier ?? 'MODERATE',
    schema_version: 1 as const,
    agnostic_settings: {
      redact_pii: false,
      max_token_spend_per_call: budget,
      allowed_providers: ['anthropic' as const],
    },
    safety_hooks: { pre_flight: [] as string[], post_flight: [] as string[] },
  };
  firewall = new FirewallPortAdapter({
    runPipeline: runPipeline as unknown as FirewallPortAdapterDeps['runPipeline'],
    adapter: new ClaudeAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: options.adapterModel ?? 'claude-sonnet-4-6',
    }) as unknown as FirewallPortAdapterDeps['adapter'],
    config: firewallConfig,
    provider: 'anthropic',
    model: options.adapterModel ?? 'claude-sonnet-4-6',
  });
} catch (error) {
  logger.warn(`Firewall module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
}
```

Then in the `deps` object, change `firewall: stubFirewall` to `firewall`.

- [ ] **Step 16: Run typecheck**

Run: `cd packages/franken-orchestrator && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 17: Run existing tests to verify no regression**

Run: `cd packages/franken-orchestrator && npx vitest run tests/unit/cli/dep-factory-providers.test.ts`
Expected: PASS — existing dep-factory tests still green

- [ ] **Step 18: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "feat: wire real FirewallPortAdapter into createCliDeps with stub fallback"
```

### Task 7: Wire Skills in dep-factory.ts

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`

- [ ] **Step 19: Add skills imports and CliDepOptions field**

Add imports:
```typescript
import { SkillRegistryBridge } from '../adapters/skill-registry-bridge.js';
import { SkillsPortAdapter } from '../adapters/skills-adapter.js';
```

Add to `CliDepOptions`:
```typescript
/** Directory containing project-local skills. Default: <root>/skills */
skillsDir?: string;
```

- [ ] **Step 20: Replace createStubSkills with real construction + fallback**

In `createCliDeps()`, after firewall construction. Note: `createStubSkills()` is retained as the fallback path.

```typescript
// createStubSkills() is retained as the fallback — do not remove
let skills: ISkillsModule = createStubSkills(options.planDirOverride ?? paths.plansDir);
try {
  const { createRegistry } = await import('@franken/skills');
  const skillsRegistry = createRegistry({
    localSkillsDir: options.skillsDir ?? resolve(paths.root, 'skills'),
  });
  await skillsRegistry.sync();
  const registryBridge = new SkillRegistryBridge(skillsRegistry);
  skills = new SkillsPortAdapter(registryBridge, adapterLlm);
} catch (error) {
  logger.warn(`Skills module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
}
```

Then in the `deps` object, change `skills: createStubSkills(...)` to `skills`.

- [ ] **Step 21: Run typecheck**

Run: `cd packages/franken-orchestrator && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 22: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "feat: wire real SkillsPortAdapter into createCliDeps with stub fallback"
```

### Task 8: Wire Memory in dep-factory.ts

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`

- [ ] **Step 23: Add memory import**

Add import:
```typescript
import { EpisodicMemoryPortAdapter } from '../adapters/episodic-memory-port-adapter.js';
```

- [ ] **Step 24: Replace stubMemory with real construction + fallback**

In `createCliDeps()`, after skills construction:

```typescript
let memory: IMemoryModule = stubMemory;
try {
  const { EpisodicMemoryStore } = await import('franken-brain');
  const Database = (await import('better-sqlite3')).default;
  const memoryDbPath = resolve(paths.buildDir, 'memory.db');
  const memoryDb = new Database(memoryDbPath);
  const episodicStore = new EpisodicMemoryStore(memoryDb);
  memory = new EpisodicMemoryPortAdapter({
    episodicStore,
    projectId: basename(paths.root),
    projectRoot: paths.root,
  });
} catch (error) {
  logger.warn(`Memory module unavailable, using stub: ${error instanceof Error ? error.message : String(error)}`, 'dep-factory');
}
```

Then in the `deps` object, change `memory: stubMemory` to `memory`.

- [ ] **Step 25: Add memory.db to reset cleanup**

In the reset block (where `checkpointFile` and `paths.tracesDb` are deleted), add:

```typescript
const memoryDbPath = resolve(paths.buildDir, 'memory.db');
for (const f of [checkpointFile, paths.tracesDb, memoryDbPath]) {
```

- [ ] **Step 26: Run typecheck**

Run: `cd packages/franken-orchestrator && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 27: Run full test suite**

Run: `cd packages/franken-orchestrator && npx vitest run`
Expected: All existing tests PASS (no regressions)

- [ ] **Step 28: Commit**

```bash
git add packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "feat: wire real EpisodicMemoryPortAdapter into createCliDeps with stub fallback"
```

---

## Chunk 4: Integration test + verify

### Task 9: Integration test for dep-factory wiring

**Files:**
- Create: `tests/integration/cli/dep-factory-wiring.test.ts`

This test verifies that `createCliDeps()` produces real module instances when packages are available, and falls back to stubs when construction is forced to fail.

- [ ] **Step 29: Write the integration test**

```typescript
// tests/integration/cli/dep-factory-wiring.test.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCliDeps } from '../../../src/cli/dep-factory.js';
import { FirewallPortAdapter } from '../../../src/adapters/firewall-adapter.js';
import { EpisodicMemoryPortAdapter } from '../../../src/adapters/episodic-memory-port-adapter.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';

function createTempPaths(): ProjectPaths {
  const root = join(tmpdir(), `dep-factory-wiring-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  const buildDir = join(root, '.build');
  mkdirSync(buildDir, { recursive: true });
  const plansDir = join(root, 'plans');
  mkdirSync(plansDir, { recursive: true });

  return {
    root,
    buildDir,
    plansDir,
    tracesDb: join(buildDir, 'traces.db'),
    chunkSessionsDir: join(buildDir, 'sessions'),
    chunkSessionSnapshotsDir: join(buildDir, 'snapshots'),
  };
}

describe('dep-factory wiring integration', () => {
  it('creates real FirewallPortAdapter when @franken/firewall is available', async () => {
    const paths = createTempPaths();
    try {
      const { deps, finalize } = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
      });

      expect(deps.firewall).toBeInstanceOf(FirewallPortAdapter);
      await finalize();
    } finally {
      rmSync(paths.root, { recursive: true, force: true });
    }
  });

  it('creates real EpisodicMemoryPortAdapter when franken-brain is available', async () => {
    const paths = createTempPaths();
    try {
      const { deps, finalize } = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
      });

      expect(deps.memory).toBeInstanceOf(EpisodicMemoryPortAdapter);
      await finalize();
    } finally {
      rmSync(paths.root, { recursive: true, force: true });
    }
  });

  it('resets memory.db when reset is true', async () => {
    const paths = createTempPaths();
    try {
      // First run creates memory.db
      const first = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: false,
      });
      await first.finalize();

      // Second run with reset should succeed (db recreated)
      const second = await createCliDeps({
        paths,
        baseBranch: 'main',
        budget: 1.0,
        provider: 'claude',
        noPr: true,
        verbose: false,
        reset: true,
      });
      expect(second.deps.memory).toBeInstanceOf(EpisodicMemoryPortAdapter);
      await second.finalize();
    } finally {
      rmSync(paths.root, { recursive: true, force: true });
    }
  });
});
```

Note: This test may need adjustments based on `ProjectPaths` shape and `createCliDeps` runtime behavior (e.g., provider registry initialization). The key assertions are `instanceof` checks proving real adapters are used.

- [ ] **Step 30: Run the integration test**

Run: `cd packages/franken-orchestrator && INTEGRATION=true npx vitest run tests/integration/cli/dep-factory-wiring.test.ts`
Expected: PASS (or adjust assertions based on actual behavior)

- [ ] **Step 31: Commit**

```bash
git add packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts
git commit -m "test: add integration test for dep-factory real module wiring and fallback"
```

### Task 10: Full build and test verification

- [ ] **Step 32: Run full monorepo build**

Run: `cd /home/pfk/dev/frankenbeast && npm run build`
Expected: All packages build successfully

- [ ] **Step 33: Run full monorepo test suite**

Run: `cd /home/pfk/dev/frankenbeast && npm test`
Expected: All tests pass across all packages

- [ ] **Step 34: Run typecheck across monorepo**

Run: `cd /home/pfk/dev/frankenbeast && npm run typecheck`
Expected: No type errors

### Task 11: Update spec status

- [ ] **Step 35: Mark spec as implemented**

In `docs/plans/2026-03-12-beastloop-tiers-1-2-wiring-design.md`, change:
```
**Status:** Draft
```
to:
```
**Status:** Implemented
```

- [ ] **Step 36: Final commit**

```bash
git add docs/plans/2026-03-12-beastloop-tiers-1-2-wiring-design.md
git commit -m "docs: mark tiers 1-2 wiring design as implemented"
```
