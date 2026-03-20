# Phase 8: Wire Everything Together

**Goal:** The Beast Loop uses the new provider registry, brain, skill loader, and middleware — through adapter classes that implement the existing `BeastLoopDeps` port interfaces. Existing orchestration logic (planning pipeline, execution engine, issue automation, MartinLoop) is preserved exactly as-is.

**Dependencies:** All previous phases (0–7)

**Why this matters:** Phases 2–7 build isolated components. Phase 8 connects them into the existing system via the adapter pattern — the dep-factory constructs new components and wraps them as implementations of the old interfaces, so the phase functions never change.

---

## Critical Principle: Adapt, Don't Destroy

The consolidation **adds** provider-agnostic capabilities. It does **not** rewrite the orchestrator's existing functionality.

### Adapter Strategy

New consolidation components implement the existing `BeastLoopDeps` port interfaces:

| BeastLoopDeps Port | Old Implementation (deleted in Phase 1) | New Adapter |
|--------------------|----------------------------------------|-------------|
| `firewall: IFirewallModule` | `frankenfirewall` | `MiddlewareChainFirewallAdapter` wraps `MiddlewareChain` |
| `memory: IMemoryModule` | `franken-brain` old API | `SqliteBrainMemoryAdapter` wraps `SqliteBrain` |
| `heartbeat: IHeartbeatModule` | `franken-heartbeat` | `ReflectionHeartbeatAdapter` wraps `CritiqueChain` |
| `skills: ISkillsModule` | `franken-skills` | `SkillManagerAdapter` wraps `SkillManager` + `ProviderRegistry` |
| `mcp: IMcpModule` | `franken-mcp` | `McpSdkAdapter` wraps `@modelcontextprotocol/sdk` |
| `observer: IObserverModule` | franken-observer (kept) | `AuditTrailObserverAdapter` wraps existing observer + `AuditTrail` |

### Protected Components (DO NOT TOUCH)

These components must survive the consolidation completely intact:

**Core Loop:**
- `BeastLoop` class, `BeastLoopDeps` interface (existing fields), `BeastContext`
- Phase functions: `runIngestion()`, `runHydration()`, `runPlanning()`, `runExecution()`, `runClosure()`
- Error types: `InjectionDetectedError`, `CritiqueSpiralError`, `HitlRejectedError`

**Planning Pipeline (9 files):**
- `ChunkDecomposer`, `ChunkFileGraphBuilder`, `LlmGraphBuilder`, `InterviewLoop`
- `ChunkValidator`, `ChunkRemediator`, `ChunkGuardrails`, `ChunkFileWriter`, `PlanContextGatherer`

**Issue Automation (7 files):**
- `IssueFetcher`, `IssueGraphBuilder`, `IssueRunner`, `IssueTriage`, `IssueReview`

**Autonomous Execution:**
- `MartinLoop` (with its own `ProviderRegistry` + `ICliProvider`)
- `CliSkillExecutor` (CLI-based skill execution with checkpoint recovery)

**Beast System:**
- Beast definitions (`design-interview`, `chunk-plan`, `martin-loop`)
- `BeastRunService`, `ProcessBeastExecutor`, `BeastEventBus`
- `PrCreator`

---

## Design

### dep-factory.ts Rewiring

`dep-factory.ts` is modified in place — there are no external users to maintain backward compatibility for. The existing `createBeastDeps()` function is updated to construct new components and wrap them as adapters.

```typescript
export function createBeastDeps(config: RunConfig, existingDeps: {...}): BeastLoopDeps {
  // 1. Construct new components
  const brain = new SqliteBrain(config.brain?.dbPath ?? ':memory:');
  const registry = new ProviderRegistry(providers, brain, { onProviderSwitch: ... });
  const middlewareChain = buildMiddlewareChain(resolveSecurityConfig(config.security));
  const skillManager = new SkillManager(config.skillsDir ?? './skills');
  const critiqueChain = new CritiqueChain(evaluators);
  const auditTrail = new AuditTrail();

  // 2. Wrap in adapters that satisfy existing BeastLoopDeps ports
  return {
    firewall: new MiddlewareChainFirewallAdapter(middlewareChain),
    memory: new SqliteBrainMemoryAdapter(brain),
    heartbeat: new ReflectionHeartbeatAdapter(critiqueChain),
    skills: new SkillManagerAdapter(skillManager, registry),
    observer: new AuditTrailObserverAdapter(existingDeps.observer, auditTrail),
    // Pass through unchanged: planner, critique, governor, logger, graphBuilder,
    //   prCreator, cliExecutor, checkpoint, refreshPlanTasks, clock
    ...existingDeps,
    // Direct access to new components (optional fields)
    providerRegistry: registry,
    sqliteBrain: brain,
    auditTrail, middlewareChain, skillManager, critiqueChain,
  };
}
```

### Beast Loop Phase Updates

Phase functions are **NOT rewritten**. They continue to call the same interfaces (`firewall.runPipeline()`, `memory.frontload()`, etc.). The adapters make it work.

Minimal additions to `beast-loop.ts`:
- Audit trail phase markers (~20 lines of `auditTrail?.append()` calls)
- Brain checkpoint after closure (~5 lines)

### Dashboard + CLI

Same as before — 4-panel dashboard (Agents, Skills, Providers, Security) with simple/advanced modes. CLI with verb-noun commands.

---

## Chunks

| # | Chunk | Committable Unit |
|---|-------|--------------------|
| 01 | [dep-factory rewiring](phase8-integration/01_dep-factory-rewiring.md) | Update `createBeastDeps()` + 6 adapter classes |
| 02 | [Beast Loop wiring](phase8-integration/02_beast-loop-phases.md) | 6 adapters + minimal beast-loop.ts additions |
| 03 | [Dashboard simple/advanced](phase8-integration/03_dashboard-simple-advanced.md) | 4-panel dashboard with mode toggle |
| 04 | [CLI commands](phase8-integration/04_cli-commands.md) | `skill`, `provider`, `security`, `dashboard` commands |
| 05 | [E2E integration test](phase8-integration/05_e2e-integration-test.md) | Full Beast Loop through consolidated deps |
| 06 | [Dashboard skill management UI](phase8-integration/06_dashboard-skill-management.md) | Skill cards, catalog browser, custom MCP form, context editor |
| 07 | [Run config schema v2](phase8-integration/07_run-config-schema-v2.md) | Zod validation + YAML parsing + CLI flag mapping |
| 08 | [franken-web cleanup](phase8-integration/08_franken-web-cleanup.md) | Remove deleted package refs, wire new API endpoints |

**Execution:** Sequential — 01 provides adapters, 02 wires them, 03+04+07 can parallel after 02, 06 after 03 (needs dashboard shell), 08 after 06, 05 is last.
