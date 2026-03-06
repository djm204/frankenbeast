# Approach C — Full BeastLoop Pipeline Design

## Problem

The build-runner (`plan-beast-runner/build-runner.ts`) reimplements RalphLoop, GitBranchIsolator, and observer tracing that now exist in the orchestrator (Approach A). The orchestrator lacks design-doc decomposition, checkpoint-based resumption, and PR creation. There is no path from "I have an idea" to "here's a PR" without the human writing all intermediate artifacts.

## Goal

Make the orchestrator handle the full pipeline from idea to PR across three input modes:

| Mode | Input | Who decomposes |
|------|-------|----------------|
| `chunks` | Pre-written `.md` chunk files on disk | Human (already done) |
| `design-doc` | A single design document | LLM via `GraphBuilder` |
| `interview` | Natural language goal/prompt | LLM interviews user → generates design doc → decomposes |

All three modes converge at the same point: a `PlanGraph` with CLI tasks that execute through the existing Approach A pipeline (RalphLoop → GitBranchIsolator → CliSkillExecutor). At the end, a PR is created targeting `--base-branch` (default: `main`).

The build-runner becomes a thin CLI shell (~150 lines) over `BeastLoop.run()`.

## Architecture

### Data Flow

```
Mode 1 (chunks):     chunk files on disk → ChunkFileGraphBuilder → PlanGraph
Mode 2 (design-doc): design-doc.md       → LlmGraphBuilder       → PlanGraph
Mode 3 (interview):  user prompt         → InterviewLoop → design-doc.md → LlmGraphBuilder → PlanGraph

                              PlanGraph
                                 │
                    ┌────────────┴────────────┐
                    │      BeastLoop.run()     │
                    │  ┌──────────────────┐   │
                    │  │ Ingestion        │   │  firewall + memory hydration
                    │  │ Planning         │   │  GraphBuilder produces PlanGraph
                    │  │ Execution        │   │  impl+harden per task via CliSkillExecutor
                    │  │ Closure          │   │  traces + PR creation
                    │  └──────────────────┘   │
                    └─────────────────────────┘
                                 │
                          gh pr create
                     (target: --base-branch or main)
```

### Two-Stage Task Model

Each chunk becomes two linked tasks in the `PlanGraph`:

```
impl:01_types ──→ harden:01_types ──→ impl:02_ralph ──→ harden:02_ralph ──→ ...
```

- `impl:<chunkId>` — TDD implementation. Depends on previous chunk's harden task.
- `harden:<chunkId>` — Review, test, fix. Depends on its own impl task.

This preserves the build-runner's impl+harden pattern inside the orchestrator's existing topological execution. The execution phase processes tasks in `PlanGraph.topoSort()` order — no special-casing needed.

### New Components

#### GraphBuilder Implementations (in `franken-orchestrator`)

| Component | File | Responsibility |
|-----------|------|----------------|
| `ChunkFileGraphBuilder` | `src/planning/chunk-file-graph-builder.ts` | Reads numbered `.md` files from a directory, produces `PlanGraph` with impl+harden task pairs. No LLM needed. |
| `LlmGraphBuilder` | `src/planning/llm-graph-builder.ts` | Takes a design doc string, sends it to `ILlmClient.complete()` with a decomposition prompt, parses the response into a `PlanGraph` with impl+harden task pairs. |
| `InterviewLoop` | `src/planning/interview-loop.ts` | Interactive Q&A loop using `ILlmClient` to gather requirements from user input, produces a design doc string. Feeds into `LlmGraphBuilder`. |

All three implement the existing `GraphBuilder` interface from franken-planner: `build(intent: Intent): Promise<PlanGraph>`. `InterviewLoop` wraps `LlmGraphBuilder` after generating the design doc.

#### Checkpoint Persistence

| Component | File | Responsibility |
|-----------|------|----------------|
| `ICheckpointStore` | `src/deps.ts` | Interface for checkpoint operations |
| `FileCheckpointStore` | `src/checkpoint/file-checkpoint-store.ts` | Append-only file implementation |

**Interface:**

```typescript
interface ICheckpointStore {
  has(key: string): boolean;
  write(key: string): void;
  readAll(): Set<string>;
  clear(): void;
  recordCommit(taskId: string, stage: string, iteration: number, commitHash: string): void;
  lastCommit(taskId: string, stage: string): string | undefined;
}
```

**Checkpoint granularity:** Every atomic commit produces a checkpoint entry. Milestone checkpoints (impl_done, harden_done, merged) are written on top.

```
# Per-commit checkpoints
01_types:impl:iter_1:commit_abc123f
01_types:impl:iter_2:commit_def456a
01_types:harden:iter_1:commit_789beef

# Milestone checkpoints
01_types:impl_done
01_types:harden_done
01_types:merged
```

Injected into `BeastLoopDeps` as optional. Execution phase checks `checkpoint.has(taskId)` before running each task, writes after completion. `autoCommitIfDirty` pairs with `recordCommit` — every auto-commit writes a checkpoint entry.

#### PR Creation (Closure Phase Extension)

| Component | File | Responsibility |
|-----------|------|----------------|
| `PrCreator` | `src/closure/pr-creator.ts` | Runs `gh pr create` targeting `--base-branch` or `main`. Generates title + body from `BeastResult`. |

Wired into `runClosure()` — runs after traces and heartbeat, only if all tasks passed.

**PR creation conditions:**
- All tasks passed (`status: 'completed'`)
- Not suppressed by `--no-pr` flag
- Idempotent: if PR already exists for this branch, skip
- On partial failure: no PR, log which chunks failed, exit 1

#### Build-Runner Refactor

The current 1,100-line `build-runner.ts` becomes ~150 lines:
1. Parse CLI args (`--base-branch`, `--budget`, `--mode`, `--plan-dir`, etc.)
2. Select `GraphBuilder` based on input mode
3. Construct `BeastLoopDeps` with real module implementations
4. Call `BeastLoop.run()`
5. Display summary from `BeastResult`
6. Exit with appropriate code

## Crash Recovery

### Resume Policy

**Default: keep dirty files.** Never silently discard passing code.

On resume with dirty state:
1. Check if tests/typecheck pass with the dirty files
2. If passing → auto-commit as recovery commit, continue
3. If failing → reset to last checkpoint commit, log what was discarded

### Recovery Matrix

| State on resume | Action |
|-----------------|--------|
| Clean, HEAD matches last checkpoint commit | Continue from next iteration |
| Clean, no checkpoint for this task | Start task fresh |
| Dirty files, tests pass | Auto-commit as recovery commit, continue |
| Dirty files, tests fail | Reset to last checkpoint commit |
| Dirty files, HEAD ahead of checkpoint | Auto-commit dirty as recovery commit, then continue |
| Branch doesn't exist but checkpoint says in-progress | Recreate branch from base, replay from last merged chunk |

### Budget Exhaustion

On budget exhaustion mid-build:
1. Checkpoint current progress
2. Auto-commit dirty files
3. Exit gracefully — resumable from checkpoint on next run

## Testing

All components use TDD (red → green → refactor). Chunk files explicitly require "write failing tests first, then implement" in their prompts.

## Tracer Bullets

### Tracer Bullet C.1 — Chunk Files Through BeastLoop

**Goal:** One pre-written chunk file → `BeastLoop.run()` with `ChunkFileGraphBuilder` → impl+harden tasks in `PlanGraph` → `CliSkillExecutor` dispatches both → `FileCheckpointStore` records per-commit progress → `PrCreator` opens PR → `BeastResult` returned to thin CLI shell.

**Proves:**
- `ChunkFileGraphBuilder` produces valid impl+harden task pairs
- Execution phase runs two-stage tasks in correct order
- Checkpoint writes happen per commit
- PR creation works in closure phase
- Build-runner is just a CLI shell over `BeastLoop.run()`

### Tracer Bullet C.2 — Design Doc Through LLM Decomposition

**Goal:** Design doc enters as `userInput` → `LlmGraphBuilder` decomposes via `ILlmClient.complete()` → `PlanGraph` with ordered tasks → execution via CLI pipeline → PR.

**Proves (beyond C.1):**
- LLM-driven decomposition integrates with `PlanGraph`
- Dependency ordering preserved through planning → execution
- Design doc content flows into chunk prompts

### Tracer Bullet C.3 — Interview to PR

**Goal:** User provides a prompt → `InterviewLoop` asks clarifying questions → generates design doc → `LlmGraphBuilder` decomposes → full execution → PR.

**Proves (beyond C.2):**
- Interactive requirement gathering works
- Generated design doc is decomposable
- Full idea-to-PR pipeline

## Key Design Decisions

1. **Three input modes converge to one pipeline** — all produce a `PlanGraph`, same execution path regardless of how you got there.

2. **Two-stage tasks are first-class PlanGraph citizens** — impl and harden are separate tasks with dependency edges, not a loop-level concern. The execution phase doesn't need to know about staging.

3. **Per-commit checkpoints** — every atomic commit is checkpointed. On resume, dirty files are kept if tests pass, discarded only if broken.

4. **PR creation is part of closure** — not a separate step. The orchestrator owns the full lifecycle.

5. **Build-runner becomes a thin shell** — CLI arg parsing, dep construction, summary display. All logic lives in the orchestrator.

6. **Plugs into existing interfaces** — `GraphBuilder` from franken-planner, `ILlmClient` from franken-brain, `CliSkillExecutor`/`RalphLoop`/`GitBranchIsolator` from Approach A.

## Risks

| Risk | Mitigation |
|------|-----------|
| LLM decomposition produces poor chunk ordering | Critique loop validates `PlanGraph` before execution |
| Interview loop generates vague design doc | Structured prompts with required sections; user confirms before proceeding |
| Checkpoint file corruption | Append-only format; `readAll()` tolerates partial lines |
| `gh` CLI not installed | Check on startup, warn and set `--no-pr` |
| Merge conflicts between chunks | Fail fast, checkpoint progress, log conflict details |
| Rate limit during LLM decomposition | Same rate limit handling as RALPH loop (sleep + provider fallback) |

## Build Order

**Phase 1 (Tracer Bullet C.1):** `ChunkFileGraphBuilder` + `FileCheckpointStore` + `PrCreator` + build-runner refactor + integration test

**Phase 2 (Tracer Bullet C.2):** `LlmGraphBuilder` + decomposition prompt engineering + critique integration

**Phase 3 (Tracer Bullet C.3):** `InterviewLoop` + interactive Q&A prompts + design doc generation

## Reused Infrastructure

| Concern | Module | Component |
|---------|--------|-----------|
| CLI skill execution | franken-orchestrator | `CliSkillExecutor` (Approach A) |
| RALPH loop | franken-orchestrator | `RalphLoop` (Approach A) |
| Git isolation | franken-orchestrator | `GitBranchIsolator` (Approach A) |
| Observer tracing | franken-observer | `TraceContext`, `SpanLifecycle`, `TokenCounter` |
| Budget enforcement | franken-observer | `CircuitBreaker`, `CostCalculator` |
| Task ordering | franken-planner | `PlanGraph.topoSort()` |
| LLM client | franken-brain | `ILlmClient.complete()` |
| Plan critique | franken-critique | `ICritiqueModule.reviewPlan()` |
| Input sanitization | frankenfirewall | `IFirewallModule.runPipeline()` |
