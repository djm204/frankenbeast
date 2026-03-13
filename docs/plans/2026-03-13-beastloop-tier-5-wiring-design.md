# BeastLoop Tier 5 Wiring: Heartbeat

**Date:** 2026-03-13
**Status:** Draft
**Branch:** `feat/beastloop-tier-5-wiring`

## Problem

The CLI BeastLoop stubs out Heartbeat. `stubHeartbeat` returns `{ improvements: [], techDebt: [], summary: '' }` — the loop never self-reflects, never detects drift, and never surfaces proactive improvement suggestions. Heartbeat is the highest-tier module because it consumes outputs from most other modules (memory, observability, critique, planner) to produce holistic system health assessments.

## Approach

Direct module instantiation in `createCliDeps()` (Approach A — same as Tiers 1-4). The stub is replaced with `HeartbeatPortAdapter` wired to `PulseOrchestrator` from `franken-heartbeat`. Because `PulseOrchestrator` has 12 dependencies — many of which are heartbeat-internal module ports that differ from the orchestrator's ports — we use a mix of real bridges and lightweight stubs for its internal deps.

## Scope

One module in `packages/franken-orchestrator`:

| Module | Adapter | Real Package | External Dep |
|--------|---------|-------------|-------------|
| Heartbeat | `HeartbeatPortAdapter` | `franken-heartbeat` | None (in-process; LLM calls use existing `AdapterLlmClient`) |

## Detailed Design

### 1. HeartbeatPortAdapter

**Current:** `stubHeartbeat` returns empty improvements, empty tech debt, empty summary.

**Target:** `HeartbeatPortAdapter` from `src/adapters/heartbeat-adapter.ts`.

**Constructor signature:**
```typescript
new HeartbeatPortAdapter(deps: HeartbeatPortAdapterDeps)
```

**`HeartbeatPortAdapterDeps` requires:**
- `pulseOrchestrator: PulseOrchestratorPort` — `{ run(): Promise<HeartbeatReportPort> }`

**The adapter maps** `HeartbeatReportPort` → `HeartbeatPulseResult`:
- `improvements` ← `report.reflection?.improvements.map(i => i.description) ?? []`
- `techDebt` ← `report.reflection?.techDebt.map(td => '${td.location}: ${td.description}') ?? []`
- `summary` ← built from `report.pulseResult` status and improvement count

### 2. PulseOrchestrator Dependencies

`PulseOrchestrator` from `franken-heartbeat` has a large dependency surface:

```typescript
interface PulseOrchestratorDeps {
  readonly memory: IMemoryModule;        // heartbeat's own IMemoryModule
  readonly observability: IObservabilityModule;  // heartbeat's own IObservabilityModule
  readonly planner: IPlannerModule;       // heartbeat's own IPlannerModule
  readonly critique: ICritiqueModule;     // heartbeat's own ICritiqueModule
  readonly hitl: IHitlGateway;           // heartbeat's own IHitlGateway
  readonly llm: ILlmClient;             // IResultLlmClient (returns Result<string>)
  readonly gitStatusExecutor: () => Promise<GitStatusResult>;
  readonly clock: () => Date;
  readonly config: HeartbeatConfig;
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly projectId: string;
}
```

**Critical distinction:** These are heartbeat's internal module port interfaces, NOT the orchestrator's `IFirewallModule`, `IMemoryModule`, etc. They have different method signatures. Each needs its own bridge or stub.

### 3. Dependency Bridging Strategy

**Real bridges (provide actual data):**

| Dep | Strategy | Rationale |
|-----|----------|-----------|
| `observability` | Bridge to `CliObserverBridge` | Real token spend and trace data available |
| `llm` | Bridge `AdapterLlmClient` to `IResultLlmClient` | Existing LLM adapter, needs Result wrapping |
| `gitStatusExecutor` | Use heartbeat's built-in `getGitStatus()` | Direct git command execution |
| `clock` | Pass `() => new Date()` | Already available in dep-factory |
| `readFile` / `writeFile` | Use `node:fs/promises` | Standard filesystem I/O |
| `projectId` | `basename(paths.root)` | Already derived |
| `config` | Construct `HeartbeatConfig` with defaults | Sensible defaults provided by schema |

**Stub deps (not wired cross-module yet):**

| Dep | Stub | Rationale |
|-----|------|-----------|
| `memory` | No-op (empty results) | Heartbeat's `IMemoryModule` has `getFailures()`, `getSuccesses()`, `getRecentTraces()`, `recordLesson()` — bridging to orchestrator's memory port requires mapping between incompatible interfaces; deferred |
| `planner` | No-op | Heartbeat's `IPlannerModule.injectTask()` pushes self-improvement tasks into the planner; not wired until planner module is real |
| `critique` | Auto-pass audit | Heartbeat's `ICritiqueModule.auditConclusions()` differs from orchestrator's `ICritiqueModule.reviewPlan()`; separate interface, deferred |
| `hitl` | No-op | Heartbeat's `IHitlGateway.sendMorningBrief()` / `notifyAlert()` differs from orchestrator's governor; deferred |

**This means:** The heartbeat will run its deterministic checker (Phase 2 — git status, token spend monitoring) with real data, but the reflection engine (Phase 3 — LLM-powered) and action dispatch (Phase 5) will be limited. When the deterministic checker finds no flags (the common case), the loop returns early with zero LLM cost. When flags ARE found, reflection will attempt to run but with empty memory context.

### 4. LLM Client Bridge

Heartbeat's `ILlmClient` is actually `IResultLlmClient` from `@franken/types`:
```typescript
interface IResultLlmClient {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}
```

The orchestrator's `AdapterLlmClient` implements the brain's `ILlmClient`:
```typescript
interface ILlmClient {
  complete(prompt: string): Promise<string>;
}
```

Bridge adapter wraps the plain-string response in a `Result`:

```typescript
// New file: src/adapters/result-llm-bridge.ts
import type { Result } from '@franken/types';

export interface ResultLlmPort {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}

export interface PlainLlmPort {
  complete(prompt: string): Promise<string>;
}

export class ResultLlmBridge implements ResultLlmPort {
  constructor(private readonly llm: PlainLlmPort) {}

  async complete(prompt: string, _options?: { maxTokens?: number }): Promise<Result<string>> {
    try {
      const value = await this.llm.complete(prompt);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
```

**Note:** The `maxTokens` option is accepted but not forwarded to the underlying LLM client since `AdapterLlmClient.complete()` doesn't support options. This is acceptable — the heartbeat config's `maxReflectionTokens` serves as a prompt-level guidance, not a hard API parameter.

### 5. Observability Bridge

Heartbeat's `IObservabilityModule` interface:
```typescript
interface IObservabilityModule {
  getTraces(since: Date): Promise<Trace[]>;
  getTokenSpend(since: Date): Promise<TokenSpendSummary>;
}
```

Bridge to `CliObserverBridge`:

```typescript
// Inline in dep-factory.ts
const heartbeatObservability = {
  getTraces: async () => [],  // Trace retrieval not yet exposed by CliObserverBridge
  getTokenSpend: async () => {
    const spend = observerBridge.getSpend();
    return { totalTokens: spend.totalTokens, totalCostUsd: spend.totalCostUsd };
  },
};
```

### 6. Wiring in `createCliDeps()`

```typescript
import { PulseOrchestrator } from 'franken-heartbeat';
import type { HeartbeatConfig } from 'franken-heartbeat';
import { HeartbeatPortAdapter } from '../adapters/heartbeat-adapter.js';
import { ResultLlmBridge } from '../adapters/result-llm-bridge.js';
import { readFile, writeFile } from 'node:fs/promises';

let heartbeat: IHeartbeatModule;
try {
  const heartbeatConfig: HeartbeatConfig = {
    deepReviewHour: 2,
    tokenSpendAlertThreshold: budget,
    heartbeatFilePath: resolve(paths.root, 'HEARTBEAT.md'),
    maxReflectionTokens: 4096,
  };

  const resultLlm = new ResultLlmBridge(adapterLlm);

  const pulseOrchestrator = new PulseOrchestrator({
    memory: {
      getRecentTraces: async () => [],
      getSuccesses: async () => [],
      getFailures: async () => [],
      recordLesson: async () => {},
    },
    observability: {
      getTraces: async () => [],
      getTokenSpend: async () => {
        const spend = observerBridge.getSpend();
        return { totalTokens: spend.totalTokens, totalCostUsd: spend.totalCostUsd };
      },
    },
    planner: { injectTask: async () => {} },
    critique: { auditConclusions: async () => ({ passed: true, findings: [] }) },
    hitl: { sendMorningBrief: async () => {}, notifyAlert: async () => {} },
    llm: resultLlm,
    gitStatusExecutor: async () => {
      // Use heartbeat's built-in getGitStatus if available,
      // otherwise stub with clean status
      try {
        const { getGitStatus } = await import('franken-heartbeat');
        return getGitStatus();
      } catch {
        return { clean: true, files: [] };
      }
    },
    clock: () => new Date(),
    config: heartbeatConfig,
    readFile: async (path: string) => {
      try { return await readFile(path, 'utf-8'); }
      catch { return ''; }
    },
    writeFile: async (path: string, content: string) => {
      await writeFile(path, content, 'utf-8');
    },
    projectId: basename(paths.root),
  });

  heartbeat = new HeartbeatPortAdapter({
    pulseOrchestrator: pulseOrchestrator as unknown as HeartbeatPortAdapterDeps['pulseOrchestrator'],
  });
} catch (error) {
  logger.warn(`Heartbeat module unavailable, using stub: ${errorMessage(error)}`, 'dep-factory');
  heartbeat = stubHeartbeat;
}
```

### 7. CliDepOptions Changes

```typescript
export interface CliDepOptions {
  // ... existing fields ...

  /** Token spend threshold that triggers heartbeat alerts. Default: budget value. */
  heartbeatSpendThreshold?: number;

  /** Max tokens for heartbeat reflection LLM calls. Default: 4096. */
  heartbeatMaxReflectionTokens?: number;
}
```

### 8. Fallback Strategy

Same pattern as all other tiers: try/catch around construction, fallback to `stubHeartbeat` with a warning log. The loop continues degraded but functional.

### 9. Testing Strategy

**Unit tests** (`tests/unit/adapters/heartbeat-wiring.test.ts`):
- `HeartbeatPortAdapter` with a mock `PulseOrchestratorPort` verifies:
  - `pulse()` maps `HeartbeatReportPort` → `HeartbeatPulseResult` correctly
  - HEARTBEAT_OK status produces expected summary
  - FLAGS_FOUND status with reflection data maps improvements and techDebt
  - Missing reflection (early return) produces empty arrays
  - Error in `pulseOrchestrator.run()` propagates with wrapped message

**Unit tests** (`tests/unit/adapters/result-llm-bridge.test.ts`):
- `ResultLlmBridge` verifies:
  - Successful completion wraps in `{ ok: true, value }`
  - Thrown error wraps in `{ ok: false, error }`
  - String errors wrapped in `Error` object

**Integration test** (`tests/integration/cli/dep-factory-heartbeat.test.ts`):
- Call `createCliDeps()` with `franken-heartbeat` available, verify `deps.heartbeat` is `HeartbeatPortAdapter` (not stub)
- Call `createCliDeps()` with forced failure, verify fallback to stub

### 10. Files Changed

| File | Change |
|------|--------|
| `src/cli/dep-factory.ts` | Replace heartbeat stub with real module construction + fallback |
| `src/adapters/result-llm-bridge.ts` | **New** — bridges plain `ILlmClient` to `IResultLlmClient` |
| `tests/unit/adapters/heartbeat-wiring.test.ts` | **New** — unit tests for heartbeat adapter wiring |
| `tests/unit/adapters/result-llm-bridge.test.ts` | **New** — unit tests for Result LLM bridge |
| `tests/integration/cli/dep-factory-heartbeat.test.ts` | **New** — integration test for wiring + fallback |

### 11. Out of Scope

- Bridging heartbeat's `IMemoryModule` to the orchestrator's real memory — requires mapping `getFailures()`, `getSuccesses()`, `getRecentTraces()` to episodic store queries; deferred until memory bridges mature
- Bridging heartbeat's `ICritiqueModule.auditConclusions()` to the orchestrator's critique — different interface from `reviewPlan()`; deferred
- Bridging heartbeat's `IHitlGateway` to the governor — different interface from `requestApproval()`; deferred
- Bridging heartbeat's `IPlannerModule.injectTask()` to the real planner — deferred until planner module is wired
- `HEARTBEAT.md` checklist file format — uses heartbeat's built-in parser; no orchestrator changes needed
- Morning brief / alert notifications — deferred until HITL gateway bridge exists
- Scheduled/periodic heartbeat execution — the `pulse()` call is triggered by the BeastLoop closure phase; scheduling is out of scope
