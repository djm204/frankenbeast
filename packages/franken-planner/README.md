# franken-planner

**MOD-04** — Planning and Decomposition module for the Frankenbeast AI agent system.

Takes a raw user intent, decomposes it into an executable task graph, and drives that graph to completion through a pluggable strategy with built-in HITL approval, Chain-of-Thought enforcement, and self-correction recovery.

---

## Architecture

```
rawInput
   │
   ▼
GuardrailsModule          (sanitize → Intent)
   │
   ▼
GraphBuilder              (Intent → PlanGraph)
   │
   ▼
HITLGate                  (approve / modify / abort)
   │
   ▼
PlanningStrategy ──────── executor (per-task)
  ├─ LinearPlanner            │
  ├─ ParallelPlanner          └─ CoT gate (optional SelfCritiqueModule)
  └─ RecursivePlanner
   │
   ▼ (on failure)
RecoveryController        (ErrorIngester → RecoveryPlanGenerator → retry)
   │
   ▼
PlanResult
```

### Key modules

| Path | Responsibility |
|------|---------------|
| `src/planner.ts` | Top-level `Planner` orchestrator — wires every component |
| `src/core/dag.ts` | Immutable `PlanGraph` DAG with topological sort |
| `src/core/types.ts` | Domain types: `Task`, `TaskResult`, `PlanResult`, `Intent` |
| `src/core/errors.ts` | Typed error hierarchy |
| `src/planners/linear.ts` | `LinearPlanner` — sequential topological execution |
| `src/planners/parallel.ts` | `ParallelPlanner` — wave-based concurrent dispatch |
| `src/planners/recursive.ts` | `RecursivePlanner` — depth-limited task expansion |
| `src/cot/rationale-enforcer.ts` | `RationaleEnforcer` — derives a `RationaleBlock` from a `Task` |
| `src/cot/cot-gate.ts` | `buildCoTExecutor` — wraps `TaskExecutor` with CoT verification |
| `src/hitl/types.ts` | `HITLGate` interface and approval result types |
| `src/hitl/plan-exporter.ts` | `PlanExporter` — renders `PlanGraph` as Markdown checklist |
| `src/hitl/plan-modifier.ts` | `applyModifications` — applies `TaskModification[]` to a graph |
| `src/hitl/stub-hitl-gate.ts` | Internal `StubHITLGate` test double (not a public package export) |
| `src/recovery/error-ingester.ts` | `ErrorIngester` — classifies errors against known patterns |
| `src/recovery/recovery-plan-generator.ts` | `RecoveryPlanGenerator` — injects a fix-it task into the graph |
| `src/recovery/recovery-controller.ts` | `RecoveryController` — orchestrates recovery with circuit breaker |

---

## Usage

```typescript
import {
  Planner,
  LinearPlanner,
  RecoveryController,
  type ApprovalResult,
  type HITLGate,
} from 'franken-planner';

class BrowserConfirmHITLGate implements HITLGate {
  async requestApproval(markdown: string): Promise<ApprovalResult> {
    return window.confirm(markdown)
      ? { decision: 'approved' }
      : { decision: 'aborted', reason: 'User rejected plan' };
  }
}

const planner = new Planner(
  guardrailsModule,   // GuardrailsModule — sanitizes raw input
  graphBuilder,       // GraphBuilder — converts Intent to PlanGraph
  taskExecutor,       // TaskExecutor — executes a single Task
  new BrowserConfirmHITLGate(), // HITLGate — approve / modify / abort the plan
  new LinearPlanner(),
  new RecoveryController(memoryModule),
  selfCritiqueModule  // optional SelfCritiqueModule — enables CoT enforcement
);

const result = await planner.plan('Build and deploy the authentication service');
// result.status: 'completed' | 'failed' | 'aborted' | 'rationale_rejected'
```

### Choosing a strategy

| Strategy | When to use |
|----------|------------|
| `LinearPlanner` | Sequential tasks where ordering matters |
| `ParallelPlanner` | Independent tasks that can run concurrently |
| `RecursivePlanner` | Tasks that may expand into sub-tasks at runtime |

### HITL approval

The `HITLGate` interface receives a Markdown-rendered plan before execution:

```typescript
interface HITLGate {
  requestApproval(markdown: string): Promise<ApprovalResult>;
}
// ApprovalResult: { decision: 'approved' }
//               | { decision: 'modified'; changes: TaskModification[] }
//               | { decision: 'aborted'; reason: string }
```

Implement this interface at the application boundary (CLI prompt, browser UI,
chat approval flow, etc.). The package's `StubHITLGate` is an internal test
double for this repository's tests and is intentionally not exported from the
public package entrypoint.

### CoT enforcement

Pass a `SelfCritiqueModule` to enable Chain-of-Thought verification before each task runs. If `verifyRationale` returns `'rejected'`, the plan halts with `status: 'rationale_rejected'`.

### Self-correction

`RecoveryController` matches task failure messages against known error patterns from `MemoryModule.getKnownErrors()`. On a match it injects a fix-it task into the graph and retries. Unknown errors and exceeded retry budgets surface as `status: 'failed'`.

---

## Development

```bash
npm install         # from repo root
npm --workspace franken-planner test
npm --workspace franken-planner run test:ci
npm --workspace franken-planner run typecheck
npm --workspace franken-planner run lint
npm --workspace franken-planner run build

# Or, from packages/franken-planner:
npm test
npm run typecheck
npm run build
```

### Test structure

```
tests/
├── unit/
│   ├── core/           # DAG, types, errors
│   ├── planners/       # LinearPlanner, ParallelPlanner, RecursivePlanner
│   ├── cot/            # RationaleEnforcer, CoT gate
│   ├── hitl/           # PlanExporter, plan-modifier, internal StubHITLGate
│   ├── recovery/       # ErrorIngester, RecoveryPlanGenerator, RecoveryController
│   └── planner.test.ts # Planner orchestrator unit tests
└── integration/
    ├── planner-linear.integration.test.ts
    ├── planner-parallel.integration.test.ts
    ├── planner-recursive.integration.test.ts
    └── planner-cot.integration.test.ts
```

All real implementations are used in integration tests; only external I/O (LLMs, disk) is stubbed.

---

## Design decisions

- **ADR-004** — Planning strategies are injected, never instantiated inside `Planner`.
- **ADR-005** — `GraphBuilder` and `Recovery` are typed interfaces; `Planner` holds no concrete dependencies beyond the strategy.
- **ADR-006** — HITL approval gate runs before any task execution; modifications are applied immutably via `applyModifications`.
- **ADR-007** — `PlanGraph` is immutable; all mutations return new instances. `insertFixItTask` increments the graph version for traceability.
