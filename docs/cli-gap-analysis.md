# Frankenbeast CLI Gap Analysis

> Comparison of old `plan-approach-c/` build runner scripts vs the current `franken-orchestrator` CLI (`frankenbeast` command).

## Resolution Summary

**All 5 gaps are CLOSED.** Resolved in `plan-2026-03-07-cli-gaps/` (12 chunks, branch `feat/cli-e2e-pipeline`).

| Gap | Description | Status | Resolved By |
|-----|-------------|--------|-------------|
| GAP-1 | LLM Adapter for plan/interview phases | **CLOSED** | Chunks 01–03: `CliLlmAdapter` (`franken-orchestrator/src/adapters/cli-llm-adapter.ts`) |
| GAP-2 | Observer integration (tokens, cost, budget) | **CLOSED** | Chunks 04–06: `CliObserverBridge` (`franken-orchestrator/src/adapters/cli-observer-bridge.ts`) |
| GAP-3 | Trace viewer | **CLOSED** | Chunk 10: `trace-viewer.ts` — `--verbose` starts TraceServer on `:4040` |
| GAP-4 | LLM commit message generation | **CLOSED** | Chunks 01–03: `CliLlmAdapter` serves as `ILlmClient` for `PrCreator` |
| GAP-5 | Config file loading | **CLOSED** | Chunk 09: `--config` loads JSON, merged with CLI args |

**Remaining minor issues** (discovered during E2E proof, chunk 11 — see `plan-2026-03-07-cli-gaps/DISCOVERED_GAPS.md`):
- No `--non-interactive` flag for CI/headless use (severity: low)
- E2E tests require `npm run build` before execution (severity: low)

## Overview

The frankenbeast project migrated execution capabilities from standalone scripts (`plan-approach-c/build-runner.ts` + `run-build.sh`) into the `franken-orchestrator` module as a proper global CLI. The CLI added new features (HITM review loops, subcommands, `.frankenbeast/` project state, `--resume`) but introduced regressions — most critically, the **interview and plan phases crash at runtime** due to a broken LLM adapter wiring.

## Critical: Plan & Interview Phases Are Broken

**The CLI cannot run `frankenbeast --design-doc <path>` or `frankenbeast interview`.** Both crash with:

```
Fatal: this.adapter.transformRequest is not a function
```

**Root cause** (`franken-orchestrator/src/cli/session.ts:124`):

```typescript
const adapterLlm = new AdapterLlmClient(deps.cliExecutor as never);
```

`AdapterLlmClient` expects an `IAdapter` with `transformRequest`/`execute`/`transformResponse`/`validateCapabilities` methods (`franken-orchestrator/src/adapters/adapter-llm-client.ts:22-27`). `CliSkillExecutor` does not implement this interface — it's a skill executor, not an LLM adapter. The `as never` cast silences TypeScript but crashes at runtime.

**Impact**: Only `frankenbeast run --plan-dir <existing-chunks>` works (pre-existing chunk files). The interview→plan→execute pipeline is non-functional.

**Fix required**: Create a proper `IAdapter` implementation that wraps `claude --print` (or the configured provider) for single-shot LLM completions, and inject it instead of `cliExecutor`.

## Capability Comparison

| Capability | Old Runner | New CLI | Status |
|---|---|---|---|
| **Input: chunk files** | `--mode chunks` | `--plan-dir` / `frankenbeast run` | Parity |
| **Input: design doc** | `--mode design-doc --design-doc <f>` | `--design-doc <f>` / `frankenbeast plan` | **Broken** (runtime crash) |
| **Input: interview** | `--mode interview` (stdin/stdout) | `frankenbeast interview` | **Broken** (runtime crash) |
| **Chunk file discovery** | `readdirSync` + `/^\d{2}.*\.md$/` | `ChunkFileGraphBuilder` (same pattern) | Parity |
| **impl+harden task pairs** | `ChunkFileGraphBuilder` | Same class | Parity |
| **Topological execution** | `PlanGraph.topoSort()` | Same mechanism via `BeastLoop` | Parity |
| **RalphLoop subprocess** | `RalphLoop` spawns `claude` CLI | Same class | Parity |
| **Git branch isolation** | `GitBranchIsolator` (feat/ prefix) | Same class + squash merge option | Enhanced |
| **Per-iteration auto-commit** | Yes | Yes | Parity |
| **Checkpoint crash recovery** | `FileCheckpointStore` (`--reset`) | Same + `--resume` flag | Enhanced |
| **HITM review loops** | None | `reviewLoop()` after design + plan phases | Enhanced (but broken — plan phase crashes) |
| **Subcommand entry points** | None (single `--mode` flag) | `interview` / `plan` / `run` subcommands | Enhanced |
| **Project state in .frankenbeast/** | None (used `.build/` inline) | `.frankenbeast/plans/`, `.frankenbeast/.build/` | Enhanced |
| **Token counting** | Full (`TokenCounter`) | Stub (always returns 0) | **Missing** |
| **Cost calculation** | Full (`CostCalculator`) | Stub (always returns 0) | **Missing** |
| **Budget circuit breaker** | Full (`CircuitBreaker`, trips on limit) | Stub (never trips) | **Missing** |
| **Loop detection** | `LoopDetector` (window+threshold) | Not wired | **Missing** |
| **Trace viewer** | `SQLiteAdapter` + `TraceServer` on :4040 | Removed | **Missing** |
| **LLM commit messages** | Interface exists, not wired | `PrCreator` accepts `llm` param, CLI never passes it | **Missing** |
| **Config file** | N/A | `--config` flag parsed but unused | **Missing** |
| **PR creation** | `PrCreator` via `gh pr create` | Same class | Parity |
| **Summary display** | Budget bar, per-chunk status, totals | Same layout (budget bar shows $0) | Visual only |
| **Graceful shutdown** | SIGINT → finalize + exit | Same pattern | Parity |

## What's at Parity

These capabilities work identically (or better) in both:

- **Chunk file execution pipeline**: `ChunkFileGraphBuilder` → `PlanGraph` → topological execution → `CliSkillExecutor` → `RalphLoop` → `GitBranchIsolator`. This is the core execution engine and it's solid.
- **Checkpoint/crash recovery**: `FileCheckpointStore` with append-only file. New CLI adds explicit `--resume` flag.
- **PR creation**: `PrCreator` pushes branch, checks for existing PR, creates via `gh pr create`.
- **Git branch isolation**: Feature branches per chunk, per-iteration auto-commits, merge back. New CLI adds optional squash merge with commit message.
- **Graceful shutdown**: SIGINT handler finalizes logs before exiting.

## What's Enhanced (New in CLI)

### HITM Review Loops
`franken-orchestrator/src/cli/review-loop.ts` — after generating a design doc or chunk files, the user is shown the artifacts and asked "proceed or revise?" with LLM-powered revision on feedback. **Currently non-functional** because the plan phase crashes before reaching the review loop.

### Subcommand Entry Points
`franken-orchestrator/src/cli/run.ts:29-54` — `resolvePhases()` maps subcommands to phase boundaries:
- `frankenbeast interview` → interview only
- `frankenbeast plan --design-doc x` → plan only
- `frankenbeast run` → execute only
- `frankenbeast` (no args) → full flow

### Project State Directory
`franken-orchestrator/src/cli/project-root.ts` — scaffolds `.frankenbeast/` at project root:
- `.frankenbeast/plans/design.md` — generated design doc
- `.frankenbeast/plans/01_*.md` — chunk files
- `.frankenbeast/.build/checkpoint` — crash recovery
- `.frankenbeast/.build/traces.db` — (unused, no observer)
- `.frankenbeast/.build/session.log` — log file

### Explicit Resume
`--resume` flag allows explicitly resuming from checkpoint (old runner relied on implicit checkpoint detection).

## What's Missing or Stubbed

### GAP-1: LLM Adapter for Plan/Interview Phases (Critical) — CLOSED

**What**: The plan and interview phases need to call an LLM (for design doc generation, chunk decomposition, revision). The old runner used the same `RalphLoop` mechanism. The new CLI tries to use `AdapterLlmClient` wrapping `CliSkillExecutor`, but the types are incompatible.

**Where**: `franken-orchestrator/src/cli/session.ts:71,124` — `new AdapterLlmClient(deps.cliExecutor as never)`

**Fix**: Create a `CliLlmAdapter` that implements `IAdapter` by wrapping `claude --print` (or codex equivalent) for single-shot LLM completions. This is different from `RalphLoop` which manages multi-iteration conversations with promise detection. The adapter needs:
- `transformRequest`: build CLI args from `UnifiedRequest`
- `execute`: spawn `claude --print` with the prompt, capture stdout
- `transformResponse`: extract text from CLI output
- `validateCapabilities`: return true for text completion

**Files to change**:
- New: `franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- Edit: `franken-orchestrator/src/cli/session.ts` — replace `deps.cliExecutor as never` with proper adapter
- Edit: `franken-orchestrator/src/cli/dep-factory.ts` — create and expose the adapter in `CliDeps`

**Complexity**: Medium. The subprocess spawning pattern already exists in `RalphLoop`; this is a simpler single-shot variant.

### GAP-2: Observer Integration (Token Counting, Cost, Budget Enforcement) — CLOSED

**What**: All observer functionality is stubbed in `dep-factory.ts:75-110`. Token counts always return 0, cost always returns 0, circuit breaker never trips. Budget limit in summary is visual noise.

**Where**: `franken-orchestrator/src/cli/dep-factory.ts:73-110` — `createStubObserver()` and `createStubObserverDeps()`

**Stub code**:
```typescript
function createStubObserver(): IObserverModule {
  return {
    startTrace: () => {},
    startSpan: () => ({ end: () => {} }),
    getTokenSpend: async () => ({
      inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0,
    }),
  };
}
```

**Fix**: Import and instantiate real observer components from `franken-observer`:
- `TokenCounter` — track prompt/completion tokens per model
- `CostCalculator` — convert tokens to USD via `DEFAULT_PRICING`
- `CircuitBreaker` — trip when spend exceeds `--budget`
- `LoopDetector` — detect infinite RALPH loops via window+threshold

**Files to change**:
- Edit: `franken-orchestrator/src/cli/dep-factory.ts` — replace stubs with real imports
- Edit: `franken-orchestrator/package.json` — add `franken-observer` dependency (if not already linked)
- May need: adapter wrappers if observer interfaces don't match `IObserverModule` exactly

**Complexity**: Medium-High. Need to verify franken-observer's exports match what `dep-factory` expects, handle initialization (SQLite for traces), and wire the `--verbose` flag to enable/disable the trace viewer.

### GAP-3: Trace Viewer

**What**: Old runner provided `--verbose` → SQLite trace storage → HTTP trace viewer on `localhost:4040`. Removed in new CLI.

**Where**: Was in old `plan-approach-c/build-runner.ts`. No equivalent in `franken-orchestrator/src/cli/`.

**Fix**: Conditionally start `TraceServer` from `franken-observer` when `--verbose` is set. Requires `SQLiteAdapter` initialization in `dep-factory.ts`.

**Files to change**:
- Edit: `franken-orchestrator/src/cli/dep-factory.ts` — add conditional trace server setup
- Edit: `franken-orchestrator/src/cli/session.ts` or `run.ts` — start/stop trace server lifecycle

**Complexity**: Low-Medium. Components exist in franken-observer; just need wiring.

### GAP-4: LLM Commit Message Generation

**What**: `PrCreator` has a `generateCommitMessage()` method that uses an optional `ILlmClient` to generate conventional commit messages from diff stats. The CLI never passes the `llm` param, so it always falls back to plain `"feat: <project> - N chunks"` titles.

**Where**: `franken-orchestrator/src/closure/pr-creator.ts:19,21,31-46` — `llm` param accepted but never injected from CLI.

**Fix**: Pass the LLM adapter (from GAP-1) to `PrCreator` in `dep-factory.ts`.

**Files to change**:
- Edit: `franken-orchestrator/src/cli/dep-factory.ts` — pass `llm` to `PrCreator` constructor
- Depends on: GAP-1 (need a working `ILlmClient`)

**Complexity**: Low (once GAP-1 is resolved).

### GAP-5: Config File Loading

**What**: `--config <path>` flag is parsed in `args.ts` but never read or applied.

**Where**: `franken-orchestrator/src/cli/args.ts` — parses the flag. `franken-orchestrator/src/cli/config-loader.ts` — exists but not called from `run.ts`.

**Fix**: Call `config-loader.ts` from `run.ts` and merge loaded config with CLI args (CLI args take precedence).

**Files to change**:
- Edit: `franken-orchestrator/src/cli/run.ts` — call config loader
- Verify: `franken-orchestrator/src/cli/config-loader.ts` — ensure it handles the full config schema

**Complexity**: Low.

## Remediation Priority

| Priority | Gap | Rationale |
|---|---|---|
| **P0** | GAP-1: LLM Adapter | Blocks plan + interview phases entirely. Without this, the CLI is execution-only. |
| **P1** | GAP-2: Observer Integration | Budget enforcement is critical for production use. Running without it risks unbounded LLM spend. |
| **P2** | GAP-4: LLM Commit Messages | Quick win once GAP-1 is done. Improves PR quality. |
| **P2** | GAP-5: Config File Loading | Quick win. Code likely already exists in config-loader.ts. |
| **P3** | GAP-3: Trace Viewer | Nice-to-have for debugging. Not blocking any functionality. |

## Dependency Graph

```
GAP-1 (LLM Adapter)
  ├── GAP-4 (LLM Commit Messages) — needs ILlmClient
  └── unblocks interview + plan phases
       └── unblocks HITM review loops (already implemented, just unreachable)

GAP-2 (Observer Integration)
  └── GAP-3 (Trace Viewer) — needs SQLiteAdapter from observer

GAP-5 (Config File Loading) — independent
```

## Verification

After all gaps are closed, the following commands should work end-to-end:

```bash
# Full interactive flow
frankenbeast --budget 5 --verbose

# Design doc → chunks → execute → PR
frankenbeast --design-doc docs/plans/some-design.md --budget 10

# Pre-existing chunks
frankenbeast run --plan-dir .frankenbeast/plans/

# Resume after crash
frankenbeast run --resume

# With config file
frankenbeast --config .frankenbeast/config.json
```

Budget bar in summary should show real USD spend. Trace viewer should be accessible at `localhost:4040` with `--verbose`. PR should have LLM-generated commit message.
