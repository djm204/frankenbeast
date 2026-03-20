# Chunk 8.2: Beast Loop Phase Wiring

**Phase:** 8 — Wire Everything Together
**Depends on:** Chunk 8.1 (dep-factory provides adapted dependencies)
**Estimated size:** Medium (~200 lines of adapter code + targeted phase changes)

---

## Purpose

Wire the new consolidation components (ProviderRegistry, SqliteBrain, MiddlewareChain, SkillManager, AuditTrail, CritiqueChain) into the Beast Loop **through the existing `BeastLoopDeps` interface**. The new components implement the old module port interfaces, so the phase functions continue to work without rewriting their core logic.

## Critical Principle: Adapt, Don't Destroy

The Beast Loop, planning pipeline, execution engine, issue automation, MartinLoop, and beast definitions all work today. The consolidation's job is to **replace the implementations behind the existing interfaces** — not rewrite the consumers.

### What Changes

The dep-factory (Chunk 8.1) will construct new components and wrap them as adapters that satisfy the existing `BeastLoopDeps` port interfaces:

| BeastLoopDeps Port | Old Implementation | New Implementation |
|--------------------|-------------------|-------------------|
| `firewall: IFirewallModule` | `frankenfirewall` package (deleted Phase 1) | `MiddlewareChainFirewallAdapter` — wraps `MiddlewareChain.processRequest()` to satisfy `IFirewallModule.runPipeline()` |
| `memory: IMemoryModule` | `franken-brain` old API | `SqliteBrainMemoryAdapter` — wraps `SqliteBrain` to satisfy `IMemoryModule.frontload()`/`getContext()`/`recordTrace()` |
| `heartbeat: IHeartbeatModule` | `franken-heartbeat` package (deleted Phase 1) | `ReflectionHeartbeatAdapter` — wraps `CritiqueChain` with reflection evaluator to satisfy `IHeartbeatModule.pulse()` |
| `skills: ISkillsModule` | `franken-skills` package (deleted Phase 1) | `SkillManagerAdapter` — wraps `SkillManager` to satisfy `ISkillsModule.hasSkill()`/`execute()`/`getAvailableSkills()` |
| `mcp: IMcpModule` | `franken-mcp` package (deleted Phase 1) | `McpSdkAdapter` — wraps `@modelcontextprotocol/sdk` client to satisfy `IMcpModule.callTool()`/`getAvailableTools()` |
| `observer: IObserverModule` | `franken-observer` old API | `AuditTrailObserverAdapter` — wraps `AuditTrail` to also satisfy existing `IObserverModule.startTrace()`/`startSpan()`/`getTokenSpend()` |

### What Does NOT Change

These components must survive the consolidation completely intact:

| Component | Location | Why |
|-----------|----------|-----|
| `BeastLoop` class | `beast-loop.ts` | Phase orchestration, error handling — no signature changes |
| `runIngestion()` | `phases/ingestion.ts` | Still calls `firewall.runPipeline()` — adapter makes it work |
| `runHydration()` | `phases/hydration.ts` | Still calls `memory.frontload()` — adapter makes it work |
| `runPlanning()` | `phases/planning.ts` | Still calls `planner.createPlan()` + `critique.reviewPlan()` + `graphBuilder.build()` — all unchanged |
| `runExecution()` | `phases/execution.ts` | Topological execution, HITL governor, CLI executor, checkpoint recovery, refreshPlanTasks — all unchanged |
| `runClosure()` | `phases/closure.ts` | Token spend, heartbeat pulse, PR creation, BeastResult — adapter makes heartbeat work |
| `BeastLoopDeps` interface | `deps.ts` | **Interface stays identical** — implementations change |
| `BeastContext` | `context/` | Session/project state, audit trail, phase tracking |
| `ChunkDecomposer` | `planning/chunk-decomposer.ts` | LLM-based design doc → chunks |
| `ChunkFileGraphBuilder` | `planning/chunk-file-graph-builder.ts` | Pre-written .md files → task graph |
| `LlmGraphBuilder` | `planning/llm-graph-builder.ts` | LLM-generated chunks |
| `InterviewLoop` | `planning/interview-loop.ts` | Interactive user interview → chunks |
| All `planning/*` files | `planning/` | Chunk validator, remediator, guardrails, file writer, context gatherer |
| All `issues/*` files | `issues/` | IssueFetcher, IssueRunner, IssueGraphBuilder, IssueTriage, IssueReview |
| `MartinLoop` | `skills/martin-loop.ts` | Autonomous CLI agent spawner |
| `CliSkillExecutor` | `skills/cli-skill-executor.ts` | CLI-based skill execution |
| `PrCreator` | `closure/pr-creator.ts` | Auto-PR creation |
| Beast definitions | `beasts/definitions/` | design-interview, chunk-plan, martin-loop templates |
| `BeastRunService` | `beasts/services/` | Run lifecycle, event bus |
| `ProcessBeastExecutor` | `beasts/execution/` | Process spawning |

---

## Implementation

### Adapter 1: MiddlewareChainFirewallAdapter

The existing `IFirewallModule.runPipeline(input)` returns `{ sanitizedText, violations, blocked }`. The new `MiddlewareChain.processRequest()` throws on injection detection and masks PII. This adapter bridges them.

```typescript
// packages/franken-orchestrator/src/adapters/middleware-firewall-adapter.ts

import type { IFirewallModule, FirewallResult } from '../deps.js';
import type { MiddlewareChain } from '../middleware/llm-middleware.js';
import { InjectionDetectedError as MiddlewareInjectionError } from '../middleware/injection-detection.js';

export class MiddlewareChainFirewallAdapter implements IFirewallModule {
  constructor(private readonly chain: MiddlewareChain) {}

  async runPipeline(input: string): Promise<FirewallResult> {
    try {
      // Run the input through middleware's beforeRequest
      // Build a minimal LlmRequest to validate
      const testRequest = {
        systemPrompt: '',
        messages: [{ role: 'user' as const, content: input }],
      };
      const processed = this.chain.processRequest(testRequest);

      // Extract the (possibly PII-masked) text back
      const sanitizedText = typeof processed.messages[0].content === 'string'
        ? processed.messages[0].content
        : input; // fallback if content blocks

      return {
        sanitizedText,
        violations: [],
        blocked: false,
      };
    } catch (error) {
      if (error instanceof MiddlewareInjectionError) {
        return {
          sanitizedText: input,
          violations: [{
            rule: error.pattern,
            severity: 'block' as const,
            detail: error.message,
          }],
          blocked: true,
        };
      }
      throw error;
    }
  }
}
```

### Adapter 2: SqliteBrainMemoryAdapter

The existing `IMemoryModule` has `frontload()`, `getContext()`, and `recordTrace()`. The new `SqliteBrain` has `working`, `episodic`, and `recovery` sub-interfaces. This adapter bridges them.

```typescript
// packages/franken-orchestrator/src/adapters/brain-memory-adapter.ts

import type { IMemoryModule, MemoryContext, EpisodicEntry } from '../deps.js';
import type { SqliteBrain } from '@frankenbeast/brain';

export class SqliteBrainMemoryAdapter implements IMemoryModule {
  constructor(private readonly brain: SqliteBrain) {}

  async frontload(projectId: string): Promise<void> {
    // SqliteBrain doesn't need frontloading — it's always hydrated
    // Retrieve any stored project context from working memory
    const stored = this.brain.working.get(`project:${projectId}`);
    if (!stored) {
      // Initialize project context in working memory
      this.brain.working.set(`project:${projectId}`, { initialized: true });
    }
  }

  async getContext(projectId: string): Promise<MemoryContext> {
    // Pull context from brain's working memory
    const adrs = (this.brain.working.get('adrs') as string[]) ?? [];
    const knownErrors = this.brain.episodic
      .recentFailures(10)
      .map(e => e.content ?? e.summary ?? String(e));
    const rules = (this.brain.working.get('rules') as string[]) ?? [];

    return { adrs, knownErrors, rules };
  }

  async recordTrace(trace: EpisodicEntry): Promise<void> {
    this.brain.episodic.record({
      type: trace.outcome === 'success' ? 'success' : 'failure',
      content: trace.summary,
      metadata: {
        taskId: trace.taskId,
        timestamp: trace.timestamp,
      },
    });
  }
}
```

### Adapter 3: ReflectionHeartbeatAdapter

The existing `IHeartbeatModule.pulse()` returns `{ improvements, techDebt, summary }`. The new `CritiqueChain` with `ReflectionEvaluator` returns severity-scored critique results. This adapter bridges them.

```typescript
// packages/franken-orchestrator/src/adapters/reflection-heartbeat-adapter.ts

import type { IHeartbeatModule, HeartbeatPulseResult } from '../deps.js';
import type { CritiqueChain } from '@frankenbeast/critique';

export class ReflectionHeartbeatAdapter implements IHeartbeatModule {
  constructor(private readonly critiqueChain: CritiqueChain) {}

  async pulse(): Promise<HeartbeatPulseResult> {
    if (!this.critiqueChain.hasEvaluator('reflection')) {
      return { improvements: [], techDebt: [], summary: 'No reflection evaluator configured' };
    }

    const result = await this.critiqueChain.evaluate({
      phase: 'closure',
      objective: 'self-assessment',
      workSummary: 'End of run reflection',
      stepsCompleted: 0,
    });

    // Map critique findings to heartbeat format
    const improvements = result.results
      .filter(r => r.severity <= 5)
      .map(r => r.message);
    const techDebt = result.results
      .filter(r => r.severity > 5)
      .map(r => r.message);

    return {
      improvements,
      techDebt,
      summary: `Reflection: ${result.results.length} findings (max severity: ${result.maxSeverity})`,
    };
  }
}
```

### Adapter 4: SkillManagerAdapter

The existing `ISkillsModule` has `hasSkill()`, `execute()`, `getAvailableSkills()`. The new `SkillManager` has `listInstalled()`, `loadForProvider()`, etc. This adapter bridges them.

```typescript
// packages/franken-orchestrator/src/adapters/skill-manager-adapter.ts

import type { ISkillsModule, SkillDescriptor, SkillInput, SkillResult } from '../deps.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';

export class SkillManagerAdapter implements ISkillsModule {
  constructor(
    private readonly skillManager: SkillManager,
    private readonly registry: ProviderRegistry,
  ) {}

  hasSkill(skillId: string): boolean {
    return this.skillManager.listInstalled().some(s => s.name === skillId);
  }

  getAvailableSkills(): readonly SkillDescriptor[] {
    return this.skillManager.listInstalled().map(s => ({
      id: s.name,
      name: s.name,
      requiresHitl: false, // MCP skills don't inherently require HITL
      executionType: 'mcp' as const,
    }));
  }

  async execute(skillId: string, input: SkillInput): Promise<SkillResult> {
    // For MCP-based skills, execution goes through the ProviderRegistry
    // The skill's MCP server is already configured on the provider
    const config = this.skillManager.loadForProvider(
      this.registry.currentProvider,
      [skillId],
    );

    // The actual LLM call with MCP tools happens via ProviderRegistry
    // This returns the tool output from the provider's execution
    let result = '';
    const request = {
      systemPrompt: config.systemPromptAddition ?? '',
      messages: [{ role: 'user' as const, content: input.objective }],
      tools: config.tools,
    };

    for await (const event of this.registry.execute(request)) {
      if (event.type === 'text') result += event.content;
    }

    return { output: result };
  }
}
```

### Adapter 5: AuditTrailObserverAdapter

The existing `IObserverModule` has `startTrace()`, `startSpan()`, `getTokenSpend()`. The new `AuditTrail` is append-only event log. This adapter wraps both — the existing observer continues to work for tracing, and the audit trail captures the same events.

```typescript
// packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts

import type { IObserverModule, SpanHandle, TokenSpendData } from '../deps.js';
import type { AuditTrail } from '@frankenbeast/observer';

export class AuditTrailObserverAdapter implements IObserverModule {
  private spans = new Map<string, { start: number }>();

  constructor(
    private readonly inner: IObserverModule, // existing observer (franken-observer)
    private readonly auditTrail: AuditTrail,
  ) {}

  startTrace(sessionId: string): void {
    this.inner.startTrace(sessionId);
    this.auditTrail.append(createAuditEvent('trace.start', { sessionId }, {
      phase: 'ingestion',
    }));
  }

  startSpan(name: string): SpanHandle {
    const innerSpan = this.inner.startSpan(name);
    const start = Date.now();

    return {
      end: (metadata?: Record<string, unknown>) => {
        innerSpan.end(metadata);
        this.auditTrail.append(createAuditEvent('span.end', {
          name,
          durationMs: Date.now() - start,
          ...metadata,
        }, {}));
      },
    };
  }

  async getTokenSpend(sessionId: string): Promise<TokenSpendData> {
    const spend = await this.inner.getTokenSpend(sessionId);
    this.auditTrail.append(createAuditEvent('token.spend', spend, {
      phase: 'closure',
    }));
    return spend;
  }
}
```

### Adapter 6: McpSdkAdapter

The existing `IMcpModule` has `callTool()` and `getAvailableTools()`. The new architecture uses `@modelcontextprotocol/sdk` directly.

```typescript
// packages/franken-orchestrator/src/adapters/mcp-sdk-adapter.ts

import type { IMcpModule, McpToolCallResult, McpToolInfo } from '../deps.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export class McpSdkAdapter implements IMcpModule {
  constructor(private readonly clients: Map<string, Client>) {}

  async callTool(name: string, args: unknown): Promise<McpToolCallResult> {
    // Find which MCP server owns this tool
    for (const [serverId, client] of this.clients) {
      const tools = await client.listTools();
      const tool = tools.tools.find(t => t.name === name);
      if (tool) {
        const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
        return {
          content: result.content,
          isError: result.isError ?? false,
        };
      }
    }
    return { content: null, isError: true };
  }

  getAvailableTools(): readonly McpToolInfo[] {
    // This is sync in the interface, so we cache tools from last listTools() call
    return this.cachedTools;
  }

  private cachedTools: McpToolInfo[] = [];

  async refreshTools(): Promise<void> {
    this.cachedTools = [];
    for (const [serverId, client] of this.clients) {
      const tools = await client.listTools();
      for (const tool of tools.tools) {
        this.cachedTools.push({
          name: tool.name,
          serverId,
          description: tool.description ?? '',
        });
      }
    }
  }
}
```

### New BeastLoopDeps Fields

The `BeastLoopDeps` interface in `deps.ts` gets **additional optional fields** for components that don't map through existing ports. Existing required fields are unchanged — this is an additive change to the interface.

```typescript
// deps.ts — ADD these fields (do not remove any existing fields)

export interface BeastLoopDeps {
  // ... ALL existing 18 fields preserved exactly as-is ...

  // New: direct access to consolidation components (for new code paths)
  readonly providerRegistry?: ProviderRegistry;
  readonly sqliteBrain?: SqliteBrain;
  readonly auditTrail?: AuditTrail;
  readonly middlewareChain?: MiddlewareChain;
  readonly skillManager?: SkillManager;
  readonly critiqueChain?: CritiqueChain;
}
```

**Why both adapters AND direct access?**
- Adapters: existing phase code continues to call `firewall.runPipeline()`, `memory.frontload()`, etc. — zero changes to phase files
- Direct access: new code (e.g., ProviderRegistry `onProviderSwitch` callback, brain checkpoint in closure, future phase enhancements) can access the real components

### Phase File Changes: Minimal Targeted Additions

Because adapters handle the interface mapping, the phase files need **very few changes**. The additions are limited to:

Phase 6.2 may already have added phase-boundary reflection hooks through `deps.heartbeat`. Preserve those hooks during consolidation; this chunk should adapt the implementation behind them, not remove them.

#### closure.ts — Brain checkpoint

Add brain checkpoint at the end of the closure phase, after all existing logic:

```typescript
// phases/closure.ts — ADD after PR creation, before return

// NEW: Brain checkpoint for crash recovery (if SqliteBrain available via deps)
// This is passed through from BeastLoop.run() as an additional call
```

The `BeastLoop.run()` method adds a post-closure brain checkpoint:

```typescript
// beast-loop.ts — ADD after runClosure() returns, before returning result

// Brain checkpoint for recovery
if (this.deps.sqliteBrain) {
  this.deps.sqliteBrain.recovery.checkpoint({
    runId: ctx.sessionId,
    phase: 'closure',
    step: result.taskResults?.length ?? 0,
    context: { status: result.status },
    timestamp: new Date().toISOString(),
  });
}

// Provider switch audit (already wired via onProviderSwitch callback in dep-factory)
```

#### beast-loop.ts — Audit trail phase markers

Add audit trail phase start/end markers around existing phase calls:

```typescript
// beast-loop.ts — WRAP existing phase calls with audit events

// Before Phase 1:
this.deps.auditTrail?.append(createAuditEvent('phase.start', { phase: 'ingestion' }, { phase: 'ingestion' }));

// After Phase 1:
this.deps.auditTrail?.append(createAuditEvent('phase.end', { phase: 'ingestion' }, { phase: 'ingestion' }));

// ... same pattern for hydration, planning, execution, closure
```

This is ~20 lines of additions to beast-loop.ts. The phase functions themselves are untouched.

---

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/adapters/middleware-firewall-adapter.test.ts
describe('MiddlewareChainFirewallAdapter', () => {
  it('returns sanitized text from middleware chain', async () => { });
  it('returns blocked=true when injection detected', async () => { });
  it('maps InjectionDetectedError to FirewallViolation', async () => { });
  it('applies PII masking to sanitized text', async () => { });
  it('passes through unmodified text when no middleware triggers', async () => { });
});

// packages/franken-orchestrator/tests/unit/adapters/brain-memory-adapter.test.ts
describe('SqliteBrainMemoryAdapter', () => {
  it('implements IMemoryModule.frontload()', async () => { });
  it('returns MemoryContext from brain working + episodic memory', async () => { });
  it('records trace as episodic event', async () => { });
  it('maps failure traces to episodic failure events', async () => { });
  it('returns empty context when brain has no stored data', async () => { });
});

// packages/franken-orchestrator/tests/unit/adapters/reflection-heartbeat-adapter.test.ts
describe('ReflectionHeartbeatAdapter', () => {
  it('returns empty result when no reflection evaluator configured', async () => { });
  it('maps critique findings to improvements/techDebt', async () => { });
  it('separates low/high severity findings', async () => { });
});

// packages/franken-orchestrator/tests/unit/adapters/skill-manager-adapter.test.ts
describe('SkillManagerAdapter', () => {
  it('implements ISkillsModule.hasSkill() from installed skills', () => { });
  it('maps installed skills to SkillDescriptor[]', () => { });
  it('executes MCP skill via ProviderRegistry', async () => { });
});

// packages/franken-orchestrator/tests/unit/adapters/audit-observer-adapter.test.ts
describe('AuditTrailObserverAdapter', () => {
  it('delegates to inner observer for all IObserverModule methods', () => { });
  it('also appends audit trail events for trace start', () => { });
  it('also appends audit trail events for span end', () => { });
  it('also appends audit trail events for token spend', () => { });
});

// packages/franken-orchestrator/tests/unit/adapters/mcp-sdk-adapter.test.ts
describe('McpSdkAdapter', () => {
  it('implements IMcpModule.callTool() via MCP SDK client', async () => { });
  it('returns isError=true when tool not found', async () => { });
  it('caches available tools from refreshTools()', async () => { });
});

// packages/franken-orchestrator/tests/integration/beast-loop-consolidation.test.ts
describe('Beast Loop with consolidated deps', () => {
  it('full loop runs with adapter-backed deps', async () => {
    // Construct deps using all adapters (mocked underlying components)
    // Run BeastLoop.run() end-to-end
    // Verify: firewall adapter called, memory adapter called, heartbeat adapter called
  });
  it('existing phase logic unchanged — graphBuilder path works', async () => { });
  it('existing phase logic unchanged — critique spiral detection works', async () => { });
  it('existing phase logic unchanged — CLI executor path works', async () => { });
  it('existing phase logic unchanged — checkpoint recovery works', async () => { });
  it('brain checkpoint created in closure when sqliteBrain provided', async () => { });
  it('audit trail captures phase events when auditTrail provided', async () => { });
  it('provider switch recorded in audit trail via onProviderSwitch callback', async () => { });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/adapters/middleware-firewall-adapter.ts`
- **Add:** `packages/franken-orchestrator/src/adapters/brain-memory-adapter.ts`
- **Add:** `packages/franken-orchestrator/src/adapters/reflection-heartbeat-adapter.ts`
- **Add:** `packages/franken-orchestrator/src/adapters/skill-manager-adapter.ts`
- **Add:** `packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts`
- **Add:** `packages/franken-orchestrator/src/adapters/mcp-sdk-adapter.ts`
- **Modify:** `packages/franken-orchestrator/src/deps.ts` — add 6 optional fields to `BeastLoopDeps`
- **Modify:** `packages/franken-orchestrator/src/beast-loop.ts` — add audit trail phase markers (~20 lines) + brain checkpoint after closure (~5 lines)
- **Add:** `packages/franken-orchestrator/tests/unit/adapters/middleware-firewall-adapter.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/adapters/brain-memory-adapter.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/adapters/reflection-heartbeat-adapter.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/adapters/skill-manager-adapter.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/adapters/audit-observer-adapter.test.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/adapters/mcp-sdk-adapter.test.ts`
- **Add:** `packages/franken-orchestrator/tests/integration/beast-loop-consolidation.test.ts`

## Exit Criteria

- **Zero breaking changes**: All existing Beast Loop tests pass without modification
- **BeastLoopDeps interface unchanged** — 18 existing fields untouched, 6 new optional fields added
- **Phase files unchanged** — ingestion, hydration, planning, execution, closure signatures and logic identical
- **6 adapters bridge old→new**: each old module port is now implemented by a new consolidation component
- **Provider-agnostic LLM**: `ProviderRegistry.execute()` accessible via `SkillManagerAdapter` and directly via `deps.providerRegistry`
- **Portable memory**: `SqliteBrain.serialize()`/`hydrate()` accessible via `deps.sqliteBrain`, memory module calls go through `SqliteBrainMemoryAdapter`
- **Cross-provider handoff**: `ProviderRegistry` uses `brain.serialize()` + `provider.formatHandoff()` on failover (wired in dep-factory's `onProviderSwitch` callback)
- **Middleware security**: `MiddlewareChain` runs injection detection + PII masking on every request via `MiddlewareChainFirewallAdapter`
- **Audit trail**: Phase events + provider switches + token spend captured via `AuditTrailObserverAdapter`
- **Brain checkpoint**: Closure creates recovery checkpoint via `deps.sqliteBrain`
- **Reflection**: Heartbeat pulse backed by `CritiqueChain` with `ReflectionEvaluator` via `ReflectionHeartbeatAdapter`
- Planning pipeline (all 9 planning files) untouched
- Issue automation (all 7 issues files) untouched
- MartinLoop untouched
- Beast definitions untouched
- CLI executor untouched
- PR creator untouched
