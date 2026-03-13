# BeastLoop Tiers 3-4 Wiring: Critique + Governor

**Date:** 2026-03-13
**Status:** Draft
**Branch:** `feat/beastloop-tiers-3-4-wiring`

## Problem

The CLI BeastLoop stubs out Critique and Governor. `stubCritique` auto-passes every plan review with `{ verdict: 'pass', findings: [], score: 1.0 }`. `stubGovernor` auto-approves every approval request with `{ decision: 'approved' }`. Without real implementations, the loop cannot self-critique generated plans or gate dangerous actions behind human-in-the-loop approval.

## Approach

Direct module instantiation in `createCliDeps()` (Approach A — same as Tiers 1-2). Each stub is replaced with its real `*PortAdapter` wired to the actual module package. Graceful fallback to stubs on construction failure.

## Scope

Two modules, all in `packages/franken-orchestrator`:

| Module | Adapter | Real Package | External Dep |
|--------|---------|-------------|-------------|
| Critique | `CritiquePortAdapter` | `@franken/critique` | None (in-process, all deterministic evaluators) |
| Governor | `GovernorPortAdapter` | `@franken/governor` | None (CLI readline for HITL channel) |

## Detailed Design

### 1. Critique Wiring

**Current:** `stubCritique` auto-passes all plan reviews.

**Target:** `CritiquePortAdapter` from `src/adapters/critique-adapter.ts`.

**Constructor signature:**
```typescript
new CritiquePortAdapter(config: CritiquePortAdapterConfig)
```

**`CritiquePortAdapterConfig` requires:**
- `loop: CritiqueLoopPort` — an object with `run(input: EvaluationInput, config: LoopConfig): Promise<CritiqueLoopResult>`
- `config: LoopConfig` — loop configuration (maxIterations, tokenBudget, consensusThreshold, sessionId, taskId)
- `source?: string` — optional source identifier

**Building the `CritiqueLoopPort`:**

The critique package provides a `createReviewer(config: ReviewerConfig): Reviewer` factory that returns a `Reviewer` with a `review(input, loopConfig)` method. This `Reviewer.review()` method IS the `CritiqueLoopPort.run()` — they have the same signature `(EvaluationInput, LoopConfig) => Promise<CritiqueLoopResult>`.

**`ReviewerConfig` requires:**
- `guardrails: GuardrailsPort` — `{ getSafetyRules(): Promise<SafetyRule[]>; executeSandbox(code, timeout): Promise<SandboxResult> }`
- `memory: MemoryPort` — `{ searchADRs(query, topK): Promise<ADRMatch[]>; searchEpisodic(taskId): Promise<EpisodicTrace[]>; recordLesson(lesson): Promise<void> }`
- `observability: ObservabilityPort` — `{ getTokenSpend(sessionId): Promise<TokenSpend> }`
- `knownPackages: readonly string[]` — list of known package names for ghost dependency detection

These are the critique package's own port interfaces (defined in `src/types/contracts.ts`), NOT the orchestrator's module ports. They need bridge implementations.

**Bridge adapters for critique's ports:**

Rather than creating full bridge adapters for each port, we provide lightweight stub implementations that give the evaluators enough to function without requiring real cross-module wiring. This is intentional — the critique evaluators are mostly deterministic and don't need real guardrails sandbox execution or semantic ADR search to provide value. The `GhostDependencyEvaluator` and `LogicLoopEvaluator` work purely on content analysis. The `SafetyEvaluator` checks against rules. The `ADRComplianceEvaluator` and `FactualityEvaluator` use memory search but gracefully handle empty results.

```typescript
// Inline in dep-factory.ts — no separate file needed
const critiqueGuardrails: GuardrailsPort = {
  getSafetyRules: async () => [],       // No custom safety rules initially
  executeSandbox: async () => ({        // No sandbox execution in CLI mode
    success: true, output: '', exitCode: 0, timedOut: false,
  }),
};

const critiqueMemory: MemoryPort = {
  searchADRs: async () => [],           // No semantic ADR search yet (needs Chroma)
  searchEpisodic: async () => [],       // No episodic search bridged yet
  recordLesson: async () => {},         // Lessons discarded until Memory Tier 2+ bridges this
};

const critiqueObservability: ObservabilityPort = {
  getTokenSpend: async (sessionId: string) => {
    const spend = observerBridge.getSpend();
    return { totalTokens: spend.totalTokens, totalCostUsd: spend.totalCostUsd };
  },
};
```

The `critiqueObservability` bridge IS real — it delegates to the already-wired `CliObserverBridge` to get actual token spend data. This enables the `TokenBudgetBreaker` circuit breaker to function.

**Type bridging note:** The critique package's `GuardrailsPort`, `MemoryPort`, and `ObservabilityPort` are defined locally in `@franken/critique` as its own port interfaces. These are NOT the orchestrator's `IFirewallModule`, `IMemoryModule`, etc. The inline stubs above satisfy the critique package's contracts without coupling to the orchestrator's module ports.

**Known packages:** Derived from workspace `package.json` names at startup. The `GhostDependencyEvaluator` uses this list to detect references to packages that don't exist in the project.

```typescript
import { readdirSync, readFileSync } from 'node:fs';

function discoverWorkspacePackages(root: string): string[] {
  const packagesDir = resolve(root, 'packages');
  try {
    return readdirSync(packagesDir)
      .map(dir => {
        try {
          const pkg = JSON.parse(readFileSync(resolve(packagesDir, dir, 'package.json'), 'utf-8'));
          return pkg.name as string;
        } catch { return null; }
      })
      .filter((name): name is string => name !== null);
  } catch { return []; }
}
```

**Wiring in `createCliDeps()`:**
```typescript
import { createReviewer } from '@franken/critique';
import type { GuardrailsPort, MemoryPort, ObservabilityPort } from '@franken/critique';
import { CritiquePortAdapter } from '../adapters/critique-adapter.js';

let critique: ICritiqueModule;
try {
  const knownPackages = discoverWorkspacePackages(paths.root);

  const critiqueGuardrails: GuardrailsPort = {
    getSafetyRules: async () => [],
    executeSandbox: async () => ({ success: true, output: '', exitCode: 0, timedOut: false }),
  };
  const critiqueMemory: MemoryPort = {
    searchADRs: async () => [],
    searchEpisodic: async () => [],
    recordLesson: async () => {},
  };
  const critiqueObservability: ObservabilityPort = {
    getTokenSpend: async () => {
      const spend = observerBridge.getSpend();
      return { totalTokens: spend.totalTokens, totalCostUsd: spend.totalCostUsd };
    },
  };

  const reviewer = createReviewer({
    guardrails: critiqueGuardrails,
    memory: critiqueMemory,
    observability: critiqueObservability,
    knownPackages,
  });

  critique = new CritiquePortAdapter({
    loop: { run: (input, config) => reviewer.review(input, config) },
    config: {
      maxIterations: 3,
      tokenBudget: budget,
      consensusThreshold: 0.7,
      sessionId: `cli-critique-${Date.now()}`,
      taskId: 'plan-review',
    },
  });
} catch (error) {
  logger.warn(`Critique module unavailable, using stub: ${errorMessage(error)}`, 'dep-factory');
  critique = stubCritique;
}
```

**Config surface:** `CliDepOptions` gains optional `critiqueMaxIterations?: number` (default `3`) and `critiqueConsensusThreshold?: number` (default `0.7`).

**Fallback:** If `createReviewer()` or `CritiquePortAdapter` construction throws, log a warning and use `stubCritique`.

### 2. Governor Wiring

**Current:** `stubGovernor` auto-approves all requests.

**Target:** `GovernorPortAdapter` from `src/adapters/governor-adapter.ts`.

**Constructor signature:**
```typescript
new GovernorPortAdapter(deps: GovernorPortAdapterDeps)
```

**`GovernorPortAdapterDeps` requires:**
- `gateway: ApprovalGatewayPort` — `{ requestApproval(request: ApprovalRequestPort): Promise<ApprovalOutcomePort> }`
- `projectId: string`
- `defaultDecision?: GovernorDecision` — when set, bypasses gateway entirely
- `idFactory?: () => string` — request ID generator
- `clock?: () => Date` — clock function

**The `GovernorPortAdapter` already handles the `requiresHitl` check:** If `request.requiresHitl` is false, it returns `{ decision: 'approved' }` without touching the gateway. This means only tasks flagged as requiring HITL will actually prompt the user.

**Building the `ApprovalGatewayPort`:**

The governor package exports `ApprovalGateway` which implements the gateway contract. It needs:
- `channel: ApprovalChannel` — the I/O channel for HITL interaction
- `auditRecorder: AuditRecorder` — records approval decisions
- `config: GovernorConfig` — timeout, signing, operator name

**CLI Channel:** The governor package provides `CliChannel` which prompts the user via readline for HITL decisions. It displays the task summary, trigger info, and presents `[a]pprove [r]egenerate a[x]bort [d]ebug` options. The `CliChannel` constructor takes `{ readline: ReadlineAdapter; operatorName: string }`.

**ReadlineAdapter:** A simple interface `{ question(prompt: string): Promise<string> }`. For CLI mode, we wrap Node's `readline/promises` module.

**AuditRecorder:** The governor package provides `GovernorAuditRecorder` which takes a `GovernorMemoryPort`. For initial wiring, we use a no-op recorder since audit persistence requires the episodic store bridge (which is part of Tier 2 Memory wiring).

**Type bridging note:** The `GovernorPortAdapter` defines local port types (`ApprovalGatewayPort`, `ApprovalRequestPort`, `ApprovalOutcomePort`) as an anti-corruption layer. The governor package's `ApprovalGateway` uses `ApprovalRequest` and `ApprovalOutcome`. These are structurally compatible for the fields used. The `gateway` argument will be passed with a type assertion (`as unknown as`) at the wiring boundary, same pattern as the firewall adapter.

**Wiring in `createCliDeps()`:**
```typescript
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  ApprovalGateway, CliChannel, defaultConfig,
} from '@franken/governor';
import type { ApprovalGatewayDeps } from '@franken/governor';
import { GovernorPortAdapter } from '../adapters/governor-adapter.js';
import type { GovernorPortAdapterDeps } from '../adapters/governor-adapter.js';

let governor: IGovernorModule;
try {
  const rl = createInterface({ input: stdin, output: stdout });

  const cliChannel = new CliChannel({
    readline: { question: (prompt: string) => rl.question(prompt) },
    operatorName: 'operator',
  });

  const noopAuditRecorder = {
    record: async () => {},
  };

  const gateway = new ApprovalGateway({
    channel: cliChannel,
    auditRecorder: noopAuditRecorder,
    config: defaultConfig(),
  });

  governor = new GovernorPortAdapter({
    gateway: gateway as unknown as GovernorPortAdapterDeps['gateway'],
    projectId: basename(paths.root),
  });

  // Close readline on finalize to prevent dangling handles
  const originalFinalize = finalize;
  finalize = async () => {
    rl.close();
    await originalFinalize();
  };
} catch (error) {
  logger.warn(`Governor module unavailable, using stub: ${errorMessage(error)}`, 'dep-factory');
  governor = stubGovernor;
}
```

**Non-interactive mode:** When the CLI is running non-interactively (e.g., piped input, CI), the readline channel would hang waiting for input. The `GovernorPortAdapter` supports `defaultDecision` for this case. We detect non-interactive mode via `!stdin.isTTY` and set `defaultDecision: 'approved'`:

```typescript
if (!stdin.isTTY) {
  governor = new GovernorPortAdapter({
    gateway: gateway as unknown as GovernorPortAdapterDeps['gateway'],
    projectId: basename(paths.root),
    defaultDecision: 'approved',
  });
}
```

**Fallback:** If `ApprovalGateway` or `GovernorPortAdapter` construction throws, log a warning and use `stubGovernor`.

### 3. CliDepOptions Changes

```typescript
export interface CliDepOptions {
  // ... existing fields ...

  /** Max critique loop iterations before halting. Default: 3. */
  critiqueMaxIterations?: number;

  /** Consensus threshold for critique pass verdict. Default: 0.7. */
  critiqueConsensusThreshold?: number;
}
```

### 4. Finalize Cleanup

The `finalize` callback already exists in `createCliDeps()`. Governor wiring adds readline cleanup to it. The pattern wraps the existing `finalize` with governor-specific teardown.

### 5. Fallback Strategy

Same pattern as Tiers 1-2: each module is constructed in a try/catch. On failure, log a warning and fall back to the existing stub. The loop continues — degraded but functional.

### 6. Testing Strategy

**Unit tests** (`tests/unit/adapters/critique-wiring.test.ts`):
- `CritiquePortAdapter` with a mock `CritiqueLoopPort` verifies:
  - `reviewPlan()` serializes `PlanGraph` to JSON and passes to `loop.run()`
  - Pass verdict maps correctly
  - Fail/halted/escalated verdicts all map to `{ verdict: 'fail' }`
  - Score is preserved from loop result

**Unit tests** (`tests/unit/adapters/governor-wiring.test.ts`):
- `GovernorPortAdapter` with a mock `ApprovalGatewayPort` verifies:
  - Non-HITL requests auto-approve without hitting gateway
  - `defaultDecision` bypasses gateway
  - APPROVE → `{ decision: 'approved' }`
  - REGEN → `{ decision: 'rejected', reason: feedback }`
  - ABORT → `{ decision: 'abort', reason }`
  - DEBUG → `{ decision: 'rejected', reason: 'Debug requested' }`

**Integration test** (`tests/integration/cli/dep-factory-critique-governor.test.ts`):
- Call `createCliDeps()` with real critique/governor packages available, verify `deps.critique` is `CritiquePortAdapter` (not stub)
- Call `createCliDeps()` with forced failure, verify fallback to stubs

### 7. Files Changed

| File | Change |
|------|--------|
| `src/cli/dep-factory.ts` | Replace critique and governor stubs with real module construction + fallback |
| `tests/unit/adapters/critique-wiring.test.ts` | **New** — unit tests for critique wiring |
| `tests/unit/adapters/governor-wiring.test.ts` | **New** — unit tests for governor wiring |
| `tests/integration/cli/dep-factory-critique-governor.test.ts` | **New** — integration test for wiring + fallback |

### 8. Out of Scope

- Bridging critique's `MemoryPort` to real episodic/semantic stores — deferred until Memory bridges are mature
- Bridging critique's `GuardrailsPort` to real firewall sandbox — deferred until sandbox execution is needed
- `GovernorCritiqueAdapter` (rationale verification flow) — separate from the `IGovernorModule` approval flow; deferred
- Audit recorder persistence — requires episodic store bridge from Tier 2
- Trigger evaluators in governor — the `GovernorPortAdapter` uses `requiresHitl` flag from the skills module; trigger evaluation happens upstream
- Signed approvals — deferred until security requirements demand it
- Slack/webhook approval channels — CLI channel only for now
