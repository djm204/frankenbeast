# Implementation Plan — franken-planner (MOD-04)

> **Methodology:** TDD (red → green → refactor), atomic commits, small logical PRs.
> Each PR ships a working vertical slice with passing tests.
> ADRs are written _before_ the code they govern.

---

## Phase Overview

| Phase | PR    | Feature                                          | ADRs             |
| ----- | ----- | ------------------------------------------------ | ---------------- |
| 0     | PR-00 | Project scaffolding + tooling                    | ADR-001, ADR-003 |
| 1     | PR-01 | Core domain types & module interfaces            | ADR-002, ADR-005 |
| 2     | PR-02 | DAG engine (construction, sort, cycle detection) | ADR-002, ADR-007 |
| 3     | PR-03 | Linear Planner                                   | ADR-004          |
| 4     | PR-04 | Parallel Planner                                 | ADR-004          |
| 5     | PR-05 | Recursive Planner                                | ADR-004          |
| 6     | PR-06 | Chain-of-Thought (CoT) enforcement               | —                |
| 7     | PR-07 | Dynamic replanning + self-correction loop        | ADR-007          |
| 8     | PR-08 | HITL approval flow                               | ADR-006          |
| 9     | PR-09 | Planner orchestrator (wires everything together) | ADR-004, ADR-005 |
| 10    | PR-10 | Integration tests + CI quality gate              | ADR-003          |

---

## PR-00 — Project Scaffolding

**Goal:** A runnable TypeScript project with testing and linting configured. No feature code yet.

### Atomic Commits

```
chore: initialize pnpm project with package.json
feat(config): add tsconfig.json with strict mode (ADR-001)
feat(test): configure Vitest with coverage thresholds (ADR-003)
feat(lint): add ESLint + Prettier with TypeScript rules
chore(ci): add GitHub Actions workflow — lint, typecheck, test
chore: add .gitignore, .editorconfig
```

### TDD Checkpoint

- A trivial `src/index.ts` exports a `version` string.
- `tests/unit/index.test.ts` asserts `version` is a non-empty string.
- CI passes on merge.

### Definition of Done

- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm test:ci` passes with coverage report generated

---

## PR-01 — Core Domain Types & Module Interfaces

**Goal:** Define all TypeScript types that the rest of the system builds on. No runtime logic yet.

### Atomic Commits

```
feat(types): define Task, TaskStatus, TaskId types (ADR-002)
feat(types): define PlanningStrategyName enum
feat(types): define Intent, ADR, KnownError, ProjectContext types
feat(types): define RationaleBlock and VerificationResult types
feat(modules): define GuardrailsModule interface (MOD-01) (ADR-005)
feat(modules): define SkillsModule interface (MOD-02) (ADR-005)
feat(modules): define MemoryModule interface (MOD-03) (ADR-005)
feat(modules): define SelfCritiqueModule interface (MOD-07) (ADR-005)
test(types): add type-guard unit tests for Task and Intent
```

### TDD Approach

- Write type-guard functions (`isTask`, `isIntent`) with tests first.
- Types themselves are validated by the compiler — tests cover runtime validation guards used at system boundaries.

### Definition of Done

- All types exported from `src/core/types.ts` and `src/modules/`
- Type guards have >80% branch coverage
- No `any` types in any source file

---

## PR-02 — DAG Engine

**Goal:** A fully-tested `PlanGraph` class supporting construction, topological sort, cycle detection, and immutable mutations (ADR-002, ADR-007).

### Atomic Commits

```
test(dag): write failing tests for PlanGraph construction
feat(dag): implement PlanGraph with adjacency list (ADR-002)
test(dag): write failing tests for topological sort (Kahn's algorithm)
feat(dag): implement topological sort via Kahn's algorithm
test(dag): write failing tests for cycle detection
feat(dag): implement cycle detection (in-degree remainder check)
test(dag): write failing tests for immutable mutation methods
feat(dag): implement addTask, removeTask, insertFixItTask returning new PlanGraph (ADR-007)
feat(dag): implement PlanVersion log and versioned mutation tracking
test(dag): add edge cases — empty graph, single node, diamond dependency
```

### TDD Approach

Each `test(dag)` commit is a red commit. The following `feat(dag)` commit makes it green. Refactor as needed before the next feature.

### Key Test Cases

- Empty graph → topological sort returns `[]`
- Linear chain A→B→C → sort returns `[A, B, C]`
- Diamond A→B, A→C, B→D, C→D → valid topo sort with D last
- Cycle A→B→A → `addTask` throws `CyclicDependencyError`
- `insertFixItTask` → returns new `PlanGraph` with version incremented; original unchanged

### Definition of Done

- `PlanGraph` is immutable (no mutating methods)
- 100% line coverage on `src/core/dag.ts`
- `CyclicDependencyError` is a typed custom error

---

## PR-03 — Linear Planner

**Goal:** `LinearPlanner` executes tasks one-by-one in topological order (ADR-004).

### Atomic Commits

```
test(planner): write failing tests for LinearPlanner (ADR-004)
feat(planner): define PlanningStrategy interface
feat(planner): implement LinearPlanner — sequential task execution
test(planner): add tests for LinearPlanner with failed task (expect PlanResult.status = 'failed')
feat(planner): implement LinearPlanner failure handling — stops on first failure
```

### TDD Approach

- Inject a `TaskExecutor` stub that resolves/rejects on demand.
- Test: plan with 3 tasks, all pass → `PlanResult.status === 'completed'`
- Test: task 2 fails → `PlanResult.status === 'failed'`, `failedTaskId === 'T-002'`

### Definition of Done

- `LinearPlanner` implements `PlanningStrategy`
- Returns typed `PlanResult` discriminated union
- Strategy selection logic is testable in isolation

---

## PR-04 — Parallel Planner

**Goal:** `ParallelPlanner` dispatches independent tasks (those with no unresolved dependencies) concurrently (ADR-004).

### Atomic Commits

```
test(planner): write failing tests for ParallelPlanner concurrency
feat(planner): implement ParallelPlanner — dispatch ready tasks via Promise.allSettled
test(planner): test partial failure — one task fails, others complete
feat(planner): implement ParallelPlanner partial-failure handling
test(planner): test dependency resolution — task only dispatched when all deps done
feat(planner): implement dependency resolution loop in ParallelPlanner
```

### Key Test Cases

- 3 independent tasks → all dispatched concurrently (verify via timing or spy call order)
- Diamond DAG → A dispatched first, B+C dispatched after A, D only after B+C
- One task fails → `PlanResult` captures partial results

### Definition of Done

- `ParallelPlanner` implements `PlanningStrategy`
- No task dispatched before its dependencies are resolved
- Partial failure captured in `PlanResult.taskResults[]`

---

## PR-05 — Recursive Planner

**Goal:** `RecursivePlanner` handles goals where step N's output defines step N+1's scope — dynamic depth (ADR-004).

### Atomic Commits

```
test(planner): write failing tests for RecursivePlanner base case
feat(planner): implement RecursivePlanner — execute and check for expansion signal
test(planner): write failing tests for RecursivePlanner with one expansion
feat(planner): implement expansion logic — append new tasks from step result
test(planner): test max-depth guard to prevent infinite recursion
feat(planner): implement max-depth limit with RecursionDepthExceededError
```

### Key Test Cases

- Task returns `{ expand: false }` → planning terminates
- Task returns `{ expand: true, newTasks: [...] }` → new tasks appended and executed
- Depth > configurable limit → `RecursionDepthExceededError` thrown

### Definition of Done

- `RecursivePlanner` implements `PlanningStrategy`
- Max-depth is configurable (default: 10)
- Expansion signal type is part of `TaskResult`

---

## PR-06 — Chain-of-Thought (CoT) Enforcement

**Goal:** Before any task is dispatched, the Planner must emit a `RationaleBlock` and receive verification from MOD-07 (Self-Critique).

### Atomic Commits

```
test(cot): write failing tests for RationaleEnforcer
feat(cot): implement RationaleEnforcer — generates rationale from task + context
test(cot): write failing tests for pre-execution verification gate
feat(cot): implement CoT gate — calls SelfCritiqueModule.verifyRationale before dispatch
test(cot): test rejected rationale — task execution blocked, error surfaced
feat(cot): implement rationale rejection handling
```

### TDD Approach

- `SelfCritiqueModule` is a fake: `verifyRationale` returns `approved` or `rejected`.
- Test: approved rationale → task proceeds
- Test: rejected rationale → task blocked, `PlanResult` contains `rationaleRejectedError`

### Definition of Done

- No task executed without a logged `RationaleBlock`
- `SelfCritiqueModule` interface is the only dependency (ADR-005)
- CoT output is part of the `PlanVersion` audit trail

---

## PR-07 — Dynamic Replanning & Self-Correction Loop

**Goal:** When a task fails or a guardrail blocks, the Planner inserts a "fix-it" subtask and re-executes (ADR-007).

### Atomic Commits

```
test(recovery): write failing tests for error ingestion from PlanResult
feat(recovery): implement ErrorIngester — classifies errors (known/unknown)
test(recovery): write failing tests for RecoveryPlanGenerator
feat(recovery): implement RecoveryPlanGenerator — queries MemoryModule for known fixes
test(recovery): write failing tests for fix-it subtask injection
feat(recovery): implement fix-it subtask injection via PlanGraph.insertFixItTask
test(recovery): test MOD-03 miss (unknown error) — escalates to HITL
feat(recovery): implement unknown-error escalation to HITLGate
test(recovery): test max-recovery-attempts guard (default: 3)
feat(recovery): implement max-recovery-attempts circuit breaker
```

### Key Test Cases

- Known error → `MemoryModule.getKnownErrors()` returns a match → fix-it task injected → new `PlanVersion` created
- Unknown error → `MemoryModule.getKnownErrors()` returns empty → HITL gate triggered
- Recovery fails 3 times → `MaxRecoveryAttemptsError` thrown; plan aborted

### Definition of Done

- Each recovery creates a new `PlanVersion` with `reason: 'recovery: ...'`
- Original plan graph is preserved (immutable, ADR-007)
- Circuit breaker prevents infinite recovery loops

---

## PR-08 — HITL Approval Flow

**Goal:** Export the plan as a Markdown checklist and gate execution on async user approval (ADR-006).

### Atomic Commits

```
test(hitl): write failing tests for PlanExporter.toMarkdown
feat(hitl): implement PlanExporter — renders PlanGraph as Markdown checklist
test(hitl): write failing tests for HITLGate approval flow
feat(hitl): define HITLGate interface (approved / modified / aborted)
feat(hitl): implement StubHITLGate for tests (auto-approve)
test(hitl): test 'modified' decision — TaskModification applied to graph
feat(hitl): implement plan modification from ApprovalResult.changes
test(hitl): test 'aborted' decision — PlanResult.status === 'aborted'
feat(hitl): implement abort handling
```

### Key Test Cases

- `PlanExporter.toMarkdown` output matches snapshot for a known 3-task DAG
- `approved` → planning proceeds immediately
- `modified` → specified tasks are updated in a new `PlanVersion` before execution
- `aborted` → `PlanResult.status === 'aborted'`, `reason` propagated

### Definition of Done

- `PlanExporter` output is deterministic (snapshot-testable)
- `HITLGate` is an interface — no UI code in `src/hitl/`
- `StubHITLGate` is exported for use in integration tests

---

## PR-09 — Planner Orchestrator

**Goal:** Wire all components into the top-level `Planner` class with full dependency injection.

### Atomic Commits

```
test(planner): write failing integration tests for Planner.plan() end-to-end
feat(planner): implement Planner class with constructor DI for all modules
feat(planner): implement strategy selection heuristic (or use Intent.strategy)
feat(planner): implement main plan() loop: receive intent → build graph → HITL → execute → recover
test(planner): test full happy path — linear 3-task plan, all pass
test(planner): test recovery path — task 2 fails, fix-it injected, succeeds on retry
test(planner): test abort path — user aborts at HITL gate
```

### Definition of Done

- `Planner` constructor accepts all module interfaces (ADR-005)
- `Planner.plan(rawInput: string): Promise<PlanResult>` is the sole public entry point
- All paths (happy, recovery, abort) covered by tests

---

## PR-10 — Integration Tests & CI Quality Gate

**Goal:** End-to-end integration tests using all stub implementations. CI enforces coverage thresholds.

### Atomic Commits

```
test(integration): add full Planner integration test with all stubs
test(integration): add integration test for recursive planning with expansion
test(integration): add integration test for parallel planning concurrency
test(integration): add integration test for CoT rejection blocking execution
chore(ci): enforce coverage threshold gate (80% stmt/branch/fn) in CI
chore(ci): add typecheck step before tests in CI pipeline
docs: update README with project overview and development guide
```

### Definition of Done

- All integration tests pass
- `pnpm test:ci` reports ≥80% coverage on all metrics
- CI pipeline is green on `main`
- No `@ts-ignore` or `as any` in source files

---

## Dependency Map (PR Order)

```
PR-00 (scaffold)
  └─ PR-01 (types)
       └─ PR-02 (DAG engine)
            ├─ PR-03 (Linear)
            ├─ PR-04 (Parallel)
            └─ PR-05 (Recursive)
                 └─ PR-06 (CoT)
                      └─ PR-07 (Replanning)
                           └─ PR-08 (HITL)
                                └─ PR-09 (Orchestrator)
                                     └─ PR-10 (Integration + CI)
```

PRs 03, 04, and 05 can be developed in parallel once PR-02 is merged.

---

## Branch Naming Convention

```
feat/pr-00-scaffolding
feat/pr-01-domain-types
feat/pr-02-dag-engine
feat/pr-03-linear-planner
feat/pr-04-parallel-planner
feat/pr-05-recursive-planner
feat/pr-06-cot-enforcement
feat/pr-07-dynamic-replanning
feat/pr-08-hitl-flow
feat/pr-09-orchestrator
feat/pr-10-integration-ci
```

## PR Checklist Template

Each PR must satisfy before merge:

- [ ] All new code covered by tests written _before_ the implementation
- [ ] `pnpm typecheck` passes (zero TypeScript errors)
- [ ] `pnpm lint` passes
- [ ] `pnpm test:ci` passes with coverage ≥80%
- [ ] ADR written for any new architectural decision
- [ ] No `any`, no `@ts-ignore` without documented justification
- [ ] PR description references the relevant phase from this plan
