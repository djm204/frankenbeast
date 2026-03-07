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

The frankenbeast project migrated execution capabilities from standalone scripts (`plan-approach-c/build-runner.ts` + `run-build.sh`) into the `franken-orchestrator` module as a proper global CLI. The CLI added new features (HITM review loops, subcommands, `.frankenbeast/` project state, `--resume`). Initial migration had 5 gaps (broken LLM adapter, stub observer, missing trace viewer, unwired config/commit messages) — all resolved in `plan-2026-03-07-cli-gaps/`.

## Critical: Plan & Interview Phases — FIXED

~~The CLI could not run `frankenbeast --design-doc <path>` or `frankenbeast interview` — both crashed with `this.adapter.transformRequest is not a function`.~~

**Resolved by** GAP-1 (Chunks 01–03): `CliLlmAdapter` implements `IAdapter` via `claude --print`, replacing the broken `deps.cliExecutor as never` cast in `session.ts`. All three input modes (chunks, design-doc, interview) now work end-to-end.

## Capability Comparison

| Capability | Old Runner | New CLI | Status |
|---|---|---|---|
| **Input: chunk files** | `--mode chunks` | `--plan-dir` / `frankenbeast run` | Parity |
| **Input: design doc** | `--mode design-doc --design-doc <f>` | `--design-doc <f>` / `frankenbeast plan` | Fixed (GAP-1) |
| **Input: interview** | `--mode interview` (stdin/stdout) | `frankenbeast interview` | Fixed (GAP-1) |
| **Chunk file discovery** | `readdirSync` + `/^\d{2}.*\.md$/` | `ChunkFileGraphBuilder` (same pattern) | Parity |
| **impl+harden task pairs** | `ChunkFileGraphBuilder` | Same class | Parity |
| **Topological execution** | `PlanGraph.topoSort()` | Same mechanism via `BeastLoop` | Parity |
| **RalphLoop subprocess** | `RalphLoop` spawns `claude` CLI | Same class | Parity |
| **Git branch isolation** | `GitBranchIsolator` (feat/ prefix) | Same class + squash merge option | Enhanced |
| **Per-iteration auto-commit** | Yes | Yes | Parity |
| **Checkpoint crash recovery** | `FileCheckpointStore` (`--reset`) | Same + `--resume` flag | Enhanced |
| **HITM review loops** | None | `reviewLoop()` after design + plan phases | Enhanced |
| **Subcommand entry points** | None (single `--mode` flag) | `interview` / `plan` / `run` subcommands | Enhanced |
| **Project state in .frankenbeast/** | None (used `.build/` inline) | `.frankenbeast/plans/`, `.frankenbeast/.build/` | Enhanced |
| **Token counting** | Full (`TokenCounter`) | Real (`CliObserverBridge` → `TokenCounter`) | Fixed (GAP-2) |
| **Cost calculation** | Full (`CostCalculator`) | Real (`CliObserverBridge` → `CostCalculator`) | Fixed (GAP-2) |
| **Budget circuit breaker** | Full (`CircuitBreaker`, trips on limit) | Real (`CliObserverBridge` → `CircuitBreaker`) | Fixed (GAP-2) |
| **Loop detection** | `LoopDetector` (window+threshold) | Real (`CliObserverBridge` → `LoopDetector`) | Fixed (GAP-2) |
| **Trace viewer** | `SQLiteAdapter` + `TraceServer` on :4040 | `--verbose` starts TraceServer on `:4040` | Fixed (GAP-3) |
| **LLM commit messages** | Interface exists, not wired | `CliLlmAdapter` passed to `PrCreator` | Fixed (GAP-4) |
| **Config file** | N/A | `--config` loads JSON, merged with CLI args | Fixed (GAP-5) |
| **PR creation** | `PrCreator` via `gh pr create` | Same class | Parity |
| **Summary display** | Budget bar, per-chunk status, totals | Same layout (budget bar shows real USD) | Parity |
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
`franken-orchestrator/src/cli/review-loop.ts` — after generating a design doc or chunk files, the user is shown the artifacts and asked "proceed or revise?" with LLM-powered revision on feedback. Now functional after GAP-1 resolution.

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
- `.frankenbeast/.build/traces.db` — SQLite trace storage (via `CliObserverBridge`)
- `.frankenbeast/.build/session.log` — log file

### Explicit Resume
`--resume` flag allows explicitly resuming from checkpoint (old runner relied on implicit checkpoint detection).

## Gaps (All Resolved)

### GAP-1: LLM Adapter for Plan/Interview Phases (Critical) — CLOSED

**Resolved by**: Chunks 01–03. New `CliLlmAdapter` (`franken-orchestrator/src/adapters/cli-llm-adapter.ts`) implements `IAdapter` via `claude --print` for single-shot LLM completions. Replaces broken `deps.cliExecutor as never` cast in `session.ts`. Env-safe: strips all `CLAUDE*` vars.

### GAP-2: Observer Integration (Token Counting, Cost, Budget Enforcement) — CLOSED

**Resolved by**: Chunks 04–06. New `CliObserverBridge` (`franken-orchestrator/src/adapters/cli-observer-bridge.ts`) bridges `IObserverModule` ↔ `ObserverDeps`. Wires real `TokenCounter`, `CostCalculator`, `CircuitBreaker`, `LoopDetector` from franken-observer. Replaces stub observer in `dep-factory.ts`.

### GAP-3: Trace Viewer — CLOSED

**Resolved by**: Chunk 10 (`franken-orchestrator/src/cli/trace-viewer.ts`). `--verbose` starts `TraceServer` on `:4040` with `SQLiteAdapter` from franken-observer.

### GAP-4: LLM Commit Message Generation — CLOSED

**Resolved by**: Chunks 01–03. `CliLlmAdapter` serves as `ILlmClient` for `PrCreator` via `dep-factory.ts`.

### GAP-5: Config File Loading — CLOSED

**Resolved by**: Chunk 09. `--config <path>` now loads JSON config via `config-loader.ts`, merged with CLI args (CLI args > env > file > defaults).

## Remediation Priority

| Priority | Gap | Rationale | Status |
|---|---|---|---|
| **P0** | GAP-1: LLM Adapter | Blocks plan + interview phases entirely. Without this, the CLI is execution-only. | **CLOSED** |
| **P1** | GAP-2: Observer Integration | Budget enforcement is critical for production use. Running without it risks unbounded LLM spend. | **CLOSED** |
| **P2** | GAP-4: LLM Commit Messages | Quick win once GAP-1 is done. Improves PR quality. | **CLOSED** |
| **P2** | GAP-5: Config File Loading | Quick win. Code likely already exists in config-loader.ts. | **CLOSED** |
| **P3** | GAP-3: Trace Viewer | Nice-to-have for debugging. Not blocking any functionality. | **CLOSED** |

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
