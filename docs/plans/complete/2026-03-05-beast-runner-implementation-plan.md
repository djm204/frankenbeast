# Beast Runner (Approach A) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Absorb the ad-hoc RALPH loop build runner into franken-orchestrator as a first-class CLI skill execution type, reusing existing observer/planner/execution infrastructure.

**Architecture:** New `CliSkillExecutor` class implements `ISkillsModule.execute()` for `executionType: 'cli'`. It composes `RalphLoop` (spawn CLI + promise detection) and `GitBranchIsolator` (branch per chunk + auto-commit + merge). Observer tracing via `TraceContext`/`SpanLifecycle`/`TokenCounter` is wired at the executor level, not duplicated.

**Tech Stack:** TypeScript (ESM, NodeNext), Vitest, node:child_process (spawn), franken-observer (`@frankenbeast/observer`)

---

## Automated Execution

This plan is decomposed into RALPH-loop chunk files in `plan-beast-runner/`:

| Chunk | Component | Dependencies |
|-------|-----------|-------------|
| 01 | Types & config interfaces | None |
| 02 | RalphLoop core + tests | 01 |
| 03 | GitBranchIsolator + tests | 01 |
| 04 | CliSkillExecutor + tests | 02, 03 |
| 05 | Execution phase wiring + tests | 04 |
| 06 | BeastLoop wiring + exports + tests | 05 |
| 07 | E2E integration test | 06 |
| 08 | Documentation + ADR | 07 |

Run via: `./plan-beast-runner/run-build.sh`

## Key Reference Files

- `franken-orchestrator/src/deps.ts` — ISkillsModule, SkillDescriptor, SkillInput, SkillResult, BeastLoopDeps
- `franken-orchestrator/src/phases/execution.ts` — executeTask() skill dispatch loop (line 214-228)
- `franken-orchestrator/src/beast-loop.ts` — BeastLoop.run() 4-phase pipeline
- `franken-orchestrator/src/skills/llm-skill-handler.ts` — structural precedent for CliSkillExecutor
- `franken-orchestrator/tests/helpers/stubs.ts` — vi.fn() factory functions for all interfaces
- `plan-2026-03-05/build-runner.ts` — existing build runner to extract patterns from
- `franken-observer/src/index.ts` — TraceContext, SpanLifecycle, TokenCounter, CostCalculator, CircuitBreaker exports

## Conventions

- All imports use `.js` extensions (NodeNext module resolution)
- `readonly` on all interface properties
- `exactOptionalPropertyTypes: true` — omit keys, don't assign `undefined`
- Tests: `import { describe, it, expect, vi } from 'vitest'`
- Mocks: factory functions in `tests/helpers/stubs.ts` with `Partial<I*>` overrides
- TDD: write failing test first, then implement, then commit
