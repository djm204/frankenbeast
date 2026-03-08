# franken-planner (MOD-04) -- Agent Ramp-Up

Planning and Decomposition module: converts user goals into executable DAGs of tasks, enforces Chain-of-Thought rationale before execution, and self-corrects on failure via fix-it task injection.

## Directory Structure

```
src/
  index.ts              # Public API barrel
  planner.ts            # Top-level Planner orchestrator
  core/
    types.ts            # Task, Intent, TaskResult, PlanResult, etc.
    dag.ts              # PlanGraph (immutable DAG), PlanVersion
    errors.ts           # Domain errors (7 classes)
    guards.ts           # isTask(), isIntent() type guards
  planners/
    types.ts            # TaskExecutor, PlanContext, PlanningStrategy, GraphBuilder
    linear.ts           # LinearPlanner - sequential topo-order execution
    parallel.ts         # ParallelPlanner - concurrent wave execution
    recursive.ts        # RecursivePlanner - handles task expansion (depth-limited)
  cot/
    cot-gate.ts         # buildCoTExecutor() - wraps executor with rationale gate
    rationale-enforcer.ts  # RationaleEnforcer - generates RationaleBlock from Task
  hitl/
    types.ts            # HITLGate, ApprovalResult, TaskModification
    plan-exporter.ts    # PlanExporter - renders PlanGraph to Markdown checklist
    plan-modifier.ts    # applyModifications() - applies HITL changes to graph
    stub-hitl-gate.ts   # StubHITLGate - auto-approves (for testing)
  recovery/
    error-ingester.ts   # ErrorIngester - classifies errors against known patterns
    recovery-controller.ts  # RecoveryController - orchestrates self-correction loop
    recovery-plan-generator.ts  # Injects fix-it tasks into the DAG
  modules/
    mod01.ts            # GuardrailsModule interface (MOD-01)
    mod02.ts            # SkillsModule interface (MOD-02)
    mod03.ts            # MemoryModule interface (MOD-03)
    mod07.ts            # SelfCritiqueModule interface (MOD-07)
tests/
  unit/                 # Mirror of src/ structure
  integration/          # End-to-end planner flows per strategy
```

## Key Types

```ts
type TaskId = string & { readonly __brand: unique symbol };  // from @franken/types
createTaskId(raw: string): TaskId;

interface Task {
  id: TaskId; objective: string; requiredSkills: string[];
  dependsOn: TaskId[]; status: TaskStatus; metadata?: Record<string, unknown>;
}
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

interface Intent { goal: string; strategy?: PlanningStrategyName; context?: Record<string, unknown>; }
type PlanningStrategyName = 'linear' | 'parallel' | 'recursive';

type TaskResult = TaskResultSuccess | TaskResultExpand | TaskResultFailure;
type PlanResult =
  | { status: 'completed'; taskResults: TaskResult[] }
  | { status: 'failed'; taskResults: TaskResult[]; failedTaskId: TaskId; error: Error }
  | { status: 'aborted'; reason: string }
  | { status: 'rationale_rejected'; taskId: TaskId };
```

## PlanGraph API

Immutable DAG -- all mutations return a new instance.

| Method | Signature | Notes |
|--------|-----------|-------|
| `empty()` | `static empty(): PlanGraph` | Factory for empty graph |
| `size()` | `(): number` | Node count |
| `topoSort()` | `(): Task[]` | Kahn's algorithm; throws `CyclicDependencyError` on cycle |
| `addTask()` | `(task: Task, dependsOn?: TaskId[]): PlanGraph` | Throws `DuplicateTaskError`; throws if dep not in graph |
| `removeTask()` | `(taskId: TaskId): PlanGraph` | Cleans refs from all edges |
| `getTask()` | `(taskId: TaskId): Task \| undefined` | |
| `getTasks()` | `(): Task[]` | All nodes (unordered) |
| `getDependencies()` | `(taskId: TaskId): TaskId[]` | Direct dependencies |
| `hasCycle()` | `(): boolean` | |
| `insertFixItTask()` | `(failedId: TaskId, fixTask: Task): PlanGraph` | Fix inherits failed's deps; failed depends on fix; increments version |
| `clone()` | `(): PlanGraph` | Deep copy |

`createPlanVersion(graph, reason): PlanVersion` -- snapshot with version number + timestamp.

## Planning Strategies

All implement `PlanningStrategy { name; execute(graph, { executor }): Promise<PlanResult> }`.

- **LinearPlanner** -- executes tasks sequentially in topo order; stops on first failure.
- **ParallelPlanner** -- runs tasks in concurrent waves (Promise.all per wave); stops after any wave with failures.
- **RecursivePlanner(maxDepth=10)** -- like linear but when a task returns `{ expand: true, newTasks }`, builds a sub-graph and recurses. Throws `RecursionDepthExceededError` past maxDepth.

## Chain-of-Thought (CoT)

- `buildCoTExecutor(executor, selfCritique, enforcer?): TaskExecutor` -- wraps executor; generates rationale via `RationaleEnforcer.generate(task)`, sends to `SelfCritiqueModule.verifyRationale()`. Rejected verdict throws `RationaleRejectedError` (task never executes).
- `RationaleEnforcer.generate(task): RationaleBlock` -- deterministic; reads `task.metadata.tool` for `selectedTool` field.

## Recovery

1. `RecoveryController(memory, errorIngester?, planGenerator?, maxAttempts=3)` -- on failure, classifies error against `MemoryModule.getKnownErrors()`.
2. Known error -> `RecoveryPlanGenerator.generate()` calls `graph.insertFixItTask()` to inject a fix-it task.
3. Unknown error -> throws `UnknownErrorEscalatedError` (escalates to HITL).
4. Exceeds maxAttempts -> throws `MaxRecoveryAttemptsError`.

## Planner Orchestrator

`new Planner(guardrails, graphBuilder, executor, hitlGate, strategy, recovery, selfCritique?)`

Flow: sanitize input (MOD-01) -> build graph (GraphBuilder) -> HITL approval gate -> execute via strategy (optionally CoT-wrapped) -> on failure, recovery loop until completed or max attempts.

## HITL

- `PlanExporter.toMarkdown(graph): string` -- renders Markdown checklist in topo order.
- `applyModifications(graph, changes: TaskModification[]): PlanGraph` -- applies objective/requiredSkills changes.
- `StubHITLGate(result?)` -- auto-approves; pass custom `ApprovalResult` for testing.

## API Gotchas

- `PlanGraph` is **immutable** -- `addTask()` etc. return a new graph; you must capture the return value.
- `addTask(task, depIds)` throws if any dep ID is not already in the graph -- add tasks in dependency order.
- `topoSort()` throws `CyclicDependencyError` on cycles; use `hasCycle()` to check first if needed.
- `TaskId` is a branded string -- use `createTaskId('raw')` to create, never cast.
- `insertFixItTask()` auto-increments `version` on the returned graph.
- Recovery `maxAttempts` default is 3; check is `attempt > maxAttempts` (so 3 attempts execute before throwing).

## Module Port Interfaces

| Interface | Module | Key method |
|-----------|--------|------------|
| `GuardrailsModule` | MOD-01 | `getSanitizedIntent(raw): Promise<Intent>` |
| `SkillsModule` | MOD-02 | `getAvailableSkills(): Promise<Skill[]>` |
| `MemoryModule` | MOD-03 | `getKnownErrors(): Promise<KnownError[]>` |
| `SelfCritiqueModule` | MOD-07 | `verifyRationale(rationale): Promise<VerificationResult>` |

## Build and Test

```bash
pnpm build          # uses tsup (NOT tsc) -- tsup src/index.ts --format esm --dts
pnpm test           # vitest (watch mode)
pnpm test:ci        # vitest run --coverage
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
```

## Dependencies

- **Runtime**: `@franken/types` (file:../franken-types) -- TaskId, RationaleBlock, VerificationResult
- **Dev**: vitest, tsup, typescript 5.x, eslint, prettier
