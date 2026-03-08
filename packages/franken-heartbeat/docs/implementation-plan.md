# Implementation Plan — franken-heartbeat (MOD-08)

> **Methodology:** TDD (red → green → refactor), atomic commits, small logical PRs.
> Each PR ships a working vertical slice with passing tests.
> ADRs are written _before_ the code they govern.

---

## Context

The Heartbeat Loop is MOD-08 in the Frankenbeast agent system. It provides scheduled, autonomous self-reflection — the agent "wakes up" independently of user prompts to perform maintenance, reflection, and proactive planning. The design follows a **"Cheap Check → Expensive Reasoning"** escalation pattern to manage LLM costs.

This is a greenfield module. Sibling modules (franken-brain, franken-planner, franken-observer, franken-governor) establish clear conventions: TypeScript strict mode, Vitest, ESM, `docs/adr/`, feature-first `src/` layout, dependency injection, and small PRs with TDD.

---

## Step 0: Update CLAUDE.md with project specifics

Before any code, append project-specific context to `CLAUDE.md` so both human and AI contributors have a single source of truth.

Add to `CLAUDE.md`:
- Module identity (MOD-08 Heartbeat Loop)
- Integration points (MOD-03, MOD-04, MOD-05, MOD-06, MOD-07)
- Repository layout
- Key architectural patterns (cheap/expensive escalation, DI, Result types)
- ADR index
- Scripts and commands

---

## Repository Layout (Target)

```
franken-heartbeat/
├── docs/
│   ├── adr/                     # Architecture Decision Records
│   │   ├── ADR-000-template.md
│   │   ├── ADR-001-typescript-strict.md
│   │   ├── ADR-002-cheap-expensive-escalation.md
│   │   ├── ADR-003-vitest-testing.md
│   │   ├── ADR-004-heartbeat-md-structured-data.md
│   │   ├── ADR-005-llm-provider-agnostic.md
│   │   └── ADR-006-module-interface-contracts.md
│   └── implementation-plan.md   # This plan (committed to repo)
├── src/
│   ├── core/                    # Types, config, errors
│   ├── checklist/               # HEARTBEAT.md parser + writer
│   ├── checker/                 # Deterministic "cheap" phase
│   ├── reflection/              # LLM-powered "expensive" phase
│   ├── reporter/                # Morning brief + action dispatch
│   ├── modules/                 # Interface contracts for MOD-03/04/05/06/07
│   ├── orchestrator/            # PulseOrchestrator — wires lifecycle
│   └── index.ts                 # Public API barrel export
├── tests/
│   ├── unit/                    # Per-feature, no I/O
│   ├── integration/             # Full lifecycle with stubs
│   └── fixtures/                # Shared test data builders
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## ADRs

| ADR | Title | Governs |
|-----|-------|---------|
| ADR-001 | TypeScript 5.x with Strict Mode | All source code |
| ADR-002 | Cheap-then-Expensive Escalation | Checker → Reflection pipeline |
| ADR-003 | Vitest as Testing Framework | All test infrastructure |
| ADR-004 | HEARTBEAT.md as Structured Data Source | Checklist parser/writer |
| ADR-005 | Provider-Agnostic LLM Interface | Reflection engine |
| ADR-006 | Module Interface Contracts (Stubs) | Integration with MOD-03/04/05/06/07 |

---

## Phase Overview

| Phase | Branch | What Ships | ADRs | PR Size |
|-------|--------|-----------|------|---------|
| 0 | `chore/project-scaffold` | Repo setup, tooling, CI skeleton, CLAUDE.md update | ADR-001, ADR-003 | ~250 lines |
| 1 | `feat/core-types` | Core types, config schema, module interfaces | ADR-006 | ~300 lines |
| 2 | `feat/checklist-parser` | HEARTBEAT.md parser and writer | ADR-004 | ~300 lines |
| 3 | `feat/deterministic-checker` | Cheap phase — scan checklist, check CI/git state | ADR-002 | ~300 lines |
| 4 | `feat/reflection-engine` | Expensive phase — LLM-powered self-reflection | ADR-002, ADR-005 | ~350 lines |
| 5 | `feat/reporter` | Morning brief generation + action dispatch | — | ~250 lines |
| 6 | `feat/pulse-orchestrator` | Orchestrator wiring the full lifecycle | ADR-002 | ~300 lines |
| 7 | `feat/cli-entry` | CLI entry point + scheduling support | — | ~200 lines |

---

## Phase 0 — Project Scaffold

**Branch:** `chore/project-scaffold`
**Goal:** Runnable Vitest suite with smoke test passing. CLAUDE.md updated with project specifics.

### Steps

1. `npm init -y` → set `"type": "module"`, name `franken-heartbeat`, version `0.1.0`
2. Install dev dependencies: `typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`
3. Install runtime dependencies: `zod` (config validation)
4. Create `tsconfig.json` — strict mode, ES2022, ESM, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
5. Create `vitest.config.ts` — coverage thresholds (lines ≥ 80%, branches ≥ 80%)
6. Add npm scripts: `test`, `test:watch`, `test:coverage`, `test:integration`, `build`, `typecheck`
7. Create `.gitignore` (node_modules, dist, coverage, *.db)
8. Create `src/index.ts` (export `VERSION = '0.1.0'`)
9. Create smoke test: `tests/unit/smoke.test.ts`
10. Create `docs/adr/ADR-000-template.md`, `ADR-001-typescript-strict.md`, `ADR-003-vitest-testing.md`
11. Update `CLAUDE.md` with project-specific section
12. Copy this plan to `docs/implementation-plan.md`

### Atomic Commits

```
chore(scaffold): init package.json with ESM and dependencies
chore(scaffold): add tsconfig.json with strict mode (ADR-001)
chore(scaffold): configure vitest with coverage thresholds (ADR-003)
chore(scaffold): add .gitignore, npm scripts, src/index.ts
test(scaffold): add smoke test to verify test harness runs
docs(adr): add ADR-000 template, ADR-001, ADR-003
docs: add implementation plan
docs: update CLAUDE.md with project specifics
```

### PR Checklist

- [ ] `npm test` passes
- [ ] `npm run typecheck` exits 0
- [ ] No `node_modules` or `dist` tracked
- [ ] CLAUDE.md has project-specific section

---

## Phase 1 — Core Types & Module Interfaces

**Branch:** `feat/core-types`
**ADR:** ADR-006
**Goal:** All shared TypeScript types, config schema, and module interface contracts. No implementation logic.

### Types to Define

```typescript
// src/core/types.ts
type PulseResult = { status: 'HEARTBEAT_OK' } | { status: 'FLAGS_FOUND'; flags: Flag[] };
type Flag = { source: string; description: string; severity: 'low' | 'medium' | 'high' };
type ReflectionResult = { patterns: string[]; improvements: Improvement[]; techDebt: TechDebtItem[] };
type Improvement = { target: string; description: string; priority: 'low' | 'medium' | 'high' };
type TechDebtItem = { location: string; description: string; effort: 'small' | 'medium' | 'large' };
type HeartbeatReport = { timestamp: string; pulseResult: PulseResult; reflection?: ReflectionResult; actions: Action[] };
type Action = { type: 'skill_proposal' | 'planner_task' | 'morning_brief'; payload: unknown };

// src/core/config.ts — Zod-validated
type HeartbeatConfig = {
  scheduleInterval: string;       // cron expression
  deepReviewHour: number;         // 0-23, default 2
  tokenSpendAlertThreshold: number;
  heartbeatFilePath: string;
  maxReflectionTokens: number;
};

// src/core/errors.ts
class HeartbeatError extends Error { ... }
class ChecklistParseError extends HeartbeatError { ... }
class ReflectionError extends HeartbeatError { ... }
```

### Module Interface Contracts (`src/modules/`)

```typescript
// src/modules/memory.ts — MOD-03 contract
interface IMemoryModule {
  getRecentTraces(hours: number): Promise<EpisodicTrace[]>;
  getSuccesses(projectId: string): Promise<MemoryEntry[]>;
  getFailures(projectId: string): Promise<MemoryEntry[]>;
  recordLesson(lesson: SemanticLesson): Promise<void>;
}

// src/modules/observability.ts — MOD-05 contract
interface IObservabilityModule {
  getTraces(since: Date): Promise<Trace[]>;
  getTokenSpend(since: Date): Promise<TokenSpendSummary>;
}

// src/modules/planner.ts — MOD-04 contract
interface IPlannerModule {
  injectTask(task: SelfImprovementTask): Promise<void>;
}

// src/modules/critique.ts — MOD-06 contract
interface ICritiqueModule {
  auditConclusions(reflection: ReflectionResult): Promise<AuditResult>;
}

// src/modules/hitl.ts — MOD-07 contract
interface IHitlGateway {
  sendMorningBrief(report: HeartbeatReport): Promise<void>;
  notifyAlert(alert: Alert): Promise<void>;
}
```

### TDD Test List

```
tests/unit/core/types.test.ts
  ✗ PulseResult discriminated union narrows on status field
  ✗ Flag severity rejects invalid values (Zod parse)
  ✗ HeartbeatConfig validates with Zod defaults
  ✗ HeartbeatConfig rejects invalid cron expression
  ✗ HeartbeatConfig rejects negative token threshold

tests/unit/core/errors.test.ts
  ✗ HeartbeatError is instanceof Error
  ✗ ChecklistParseError carries source file path
  ✗ ReflectionError carries the original LLM error
```

### Atomic Commits

```
docs(adr): add ADR-006 module interface contracts
test(core): add failing tests for PulseResult and Flag types
feat(core): define PulseResult, Flag, ReflectionResult types
test(core): add failing tests for HeartbeatConfig Zod schema
feat(core): implement HeartbeatConfig with Zod validation
test(core): add failing tests for custom error classes
feat(core): implement HeartbeatError hierarchy
feat(modules): define IMemoryModule, IObservabilityModule interfaces
feat(modules): define IPlannerModule, ICritiqueModule, IHitlGateway interfaces
```

### PR Checklist

- [ ] No implementation logic — only types, interfaces, schemas, errors
- [ ] All Zod schemas have unit tests
- [ ] No circular imports
- [ ] Module interfaces match the contracts described in project-overview.md

---

## Phase 2 — Checklist Parser

**Branch:** `feat/checklist-parser`
**ADR:** ADR-004
**Goal:** Parse `HEARTBEAT.md` into typed WatchlistItem[] and ReflectionEntry[]. Write updates back.

### TDD Test List

```
tests/unit/checklist/parser.test.ts
  ✗ parses empty file into empty watchlist and reflection log
  ✗ parses unchecked watchlist items (- [ ])
  ✗ parses checked watchlist items (- [x])
  ✗ extracts description text from watchlist items
  ✗ parses reflection log entries with date prefix
  ✗ handles malformed lines gracefully (skips with warning)
  ✗ preserves unknown sections passthrough

tests/unit/checklist/writer.test.ts
  ✗ serializes WatchlistItem[] back to markdown
  ✗ marks completed items with [x]
  ✗ appends new reflection entry to log section
  ✗ preserves existing content when appending
```

### Atomic Commits

```
docs(adr): add ADR-004 HEARTBEAT.md as structured data source
test(checklist): add failing parser tests for watchlist items
feat(checklist): implement ChecklistParser for watchlist section
test(checklist): add failing parser tests for reflection log
feat(checklist): implement reflection log parsing
test(checklist): add failing tests for malformed input handling
feat(checklist): add graceful error handling for malformed lines
test(checklist): add failing writer tests
feat(checklist): implement ChecklistWriter
refactor(checklist): extract markdown section helpers
```

### PR Checklist

- [ ] Parser is pure function (no I/O) — takes string, returns typed result
- [ ] Writer is pure function — takes typed data, returns string
- [ ] File I/O is NOT in this module (will be in orchestrator)
- [ ] Malformed input produces warnings, not crashes

---

## Phase 3 — Deterministic Checker

**Branch:** `feat/deterministic-checker`
**ADR:** ADR-002
**Goal:** The "cheap" phase. Scans checklist for pending items, checks git dirtiness, checks token spend. Zero LLM tokens.

### TDD Test List

```
tests/unit/checker/deterministic-checker.test.ts
  ✗ returns HEARTBEAT_OK when no pending watchlist items and git is clean
  ✗ returns FLAGS_FOUND when there are unchecked watchlist items
  ✗ returns FLAGS_FOUND when git repo has uncommitted changes
  ✗ returns FLAGS_FOUND when token spend exceeds threshold
  ✗ returns FLAGS_FOUND with deep_review flag at configured hour
  ✗ aggregates multiple flags from different sources
  ✗ flags include severity levels

tests/unit/checker/git-status-checker.test.ts
  ✗ reports clean when no uncommitted changes
  ✗ reports dirty with list of changed files
  ✗ handles git command failure gracefully

tests/unit/checker/token-spend-checker.test.ts
  ✗ returns no flag when spend is under threshold
  ✗ returns flag with spend amount when over threshold
```

### Atomic Commits

```
docs(adr): add ADR-002 cheap-then-expensive escalation
test(checker): add failing tests for DeterministicChecker happy path
feat(checker): implement DeterministicChecker returning PulseResult
test(checker): add failing tests for git status checking
feat(checker): implement GitStatusChecker with injected executor
test(checker): add failing tests for token spend checking
feat(checker): implement TokenSpendChecker with IObservabilityModule
test(checker): add failing tests for deep review time trigger
feat(checker): implement deep review hour check
test(checker): add failing tests for flag aggregation
feat(checker): implement multi-source flag aggregation
```

### PR Checklist

- [ ] Zero LLM calls in this module
- [ ] Git command execution is behind an injectable interface (testable without git)
- [ ] Clock is injectable for deep review hour testing
- [ ] All checkers are composable (each returns Flag[])

---

## Phase 4 — Reflection Engine

**Branch:** `feat/reflection-engine`
**ADR:** ADR-002, ADR-005
**Goal:** The "expensive" phase. LLM-powered analysis answering the three Deep Reflection questions.

### Types

```typescript
// src/reflection/types.ts
interface ILlmClient {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}
```

### TDD Test List

```
tests/unit/reflection/reflection-engine.test.ts
  ✗ queries IMemoryModule for last 24h traces
  ✗ queries IObservabilityModule for last 24h traces
  ✗ constructs prompt from traces and failures
  ✗ calls ILlmClient with constructed prompt
  ✗ parses LLM response into ReflectionResult
  ✗ handles LLM failure gracefully (returns error Result)
  ✗ respects maxReflectionTokens config

tests/unit/reflection/prompt-builder.test.ts
  ✗ builds pattern analysis prompt from traces
  ✗ builds improvement suggestion prompt from failures
  ✗ builds tech debt scan prompt from memory entries
  ✗ includes context summary in all prompts

tests/unit/reflection/response-parser.test.ts
  ✗ parses structured LLM response into ReflectionResult
  ✗ handles malformed LLM response gracefully
  ✗ extracts patterns, improvements, and tech debt items
```

### Atomic Commits

```
docs(adr): add ADR-005 provider-agnostic LLM interface
test(reflection): add failing tests for prompt construction
feat(reflection): implement PromptBuilder for reflection questions
test(reflection): add failing tests for response parsing
feat(reflection): implement ResponseParser with error handling
test(reflection): add failing tests for ReflectionEngine orchestration
feat(reflection): implement ReflectionEngine with DI
test(reflection): add failing tests for LLM failure fallback
feat(reflection): implement graceful LLM error handling with Result type
```

### PR Checklist

- [ ] `ILlmClient` is injected — no direct SDK imports
- [ ] Prompt templates are named constants
- [ ] Response parsing handles malformed output without crashing
- [ ] Uses Result type for expected failures (not throw)

---

## Phase 5 — Reporter

**Branch:** `feat/reporter`
**Goal:** Generate the Morning Brief, propose skill improvements, inject planner tasks.

### TDD Test List

```
tests/unit/reporter/morning-brief-builder.test.ts
  ✗ builds brief from HeartbeatReport with no reflection (pulse only)
  ✗ builds brief with full reflection including patterns and improvements
  ✗ formats brief as structured markdown

tests/unit/reporter/action-dispatcher.test.ts
  ✗ dispatches skill_proposal to IPlannerModule
  ✗ dispatches planner_task to IPlannerModule
  ✗ dispatches morning_brief to IHitlGateway
  ✗ handles dispatch failure gracefully (logs, does not throw)
  ✗ skips dispatch when no actions to take
```

### Atomic Commits

```
test(reporter): add failing tests for MorningBriefBuilder
feat(reporter): implement MorningBriefBuilder
test(reporter): add failing tests for ActionDispatcher
feat(reporter): implement ActionDispatcher with module injection
test(reporter): add failing tests for dispatch error handling
feat(reporter): implement graceful dispatch failure handling
```

### PR Checklist

- [ ] Brief format is snapshot-testable (deterministic output)
- [ ] ActionDispatcher uses module interfaces only (DI)
- [ ] Dispatch failures are logged but don't crash the heartbeat

---

## Phase 6 — Pulse Orchestrator

**Branch:** `feat/pulse-orchestrator`
**ADR:** ADR-002
**Goal:** Public entry point composing the full heartbeat lifecycle: Pulse → Check → Reflect → Report.

### TDD Test List

```
tests/unit/orchestrator/pulse-orchestrator.test.ts
  ✗ returns HEARTBEAT_OK when checker finds no flags (no reflection called)
  ✗ triggers reflection when checker finds flags
  ✗ sends audit to ICritiqueModule before dispatching actions
  ✗ discards reflection when critique fails audit
  ✗ dispatches actions via reporter after successful audit
  ✗ writes updated checklist after processing
  ✗ produces HeartbeatReport summarizing full run

tests/integration/orchestrator/pulse-orchestrator.integration.test.ts
  ✗ full happy path: flags found → reflect → audit passes → morning brief sent
  ✗ cheap path: no flags → HEARTBEAT_OK → no LLM calls
  ✗ audit rejection: flags → reflect → audit fails → no actions dispatched
```

### Atomic Commits

```
test(orchestrator): add failing tests for cheap path (no flags)
feat(orchestrator): implement PulseOrchestrator skeleton with DI
test(orchestrator): add failing tests for expensive path (flags found)
feat(orchestrator): implement reflection trigger on flags
test(orchestrator): add failing tests for critique audit gate
feat(orchestrator): implement critique audit before action dispatch
test(orchestrator): add failing tests for action dispatch
feat(orchestrator): implement action dispatch via reporter
test(orchestrator): add integration test for full lifecycle
feat(orchestrator): wire checklist read/write into lifecycle
```

### PR Checklist

- [ ] All dependencies injected via constructor (no `new` inside orchestrator)
- [ ] PulseOrchestrator is the primary export from `src/index.ts`
- [ ] Cheap path is tested to confirm zero LLM calls
- [ ] Integration test covers all three paths (ok, reflect+pass, reflect+reject)

---

## Phase 7 — CLI Entry Point

**Branch:** `feat/cli-entry`
**Goal:** CLI binary that can be invoked by cron or manually. Wires real dependencies.

### TDD Test List

```
tests/unit/cli/cli.test.ts
  ✗ parses --config flag for custom config path
  ✗ parses --heartbeat-file flag for custom HEARTBEAT.md path
  ✗ parses --dry-run flag (skips action dispatch)
  ✗ exits 0 on HEARTBEAT_OK
  ✗ exits 0 on successful reflection + dispatch
  ✗ exits 1 on unrecoverable error

tests/integration/cli/cli.integration.test.ts
  ✗ full run with stub modules produces valid HeartbeatReport
```

### Atomic Commits

```
test(cli): add failing tests for argument parsing
feat(cli): implement CLI argument parser
test(cli): add failing tests for exit codes
feat(cli): implement CLI runner with PulseOrchestrator
feat(cli): add bin entry in package.json
test(cli): add integration test for full CLI run
chore(cli): add graceful shutdown handler
```

### PR Checklist

- [ ] `bin` field in package.json points to compiled entry
- [ ] `--dry-run` is tested
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] No hardcoded paths — all configurable

---

## Cross-Cutting Concerns (Every Phase)

### Commit Message Format

Conventional Commits per `git-workflow.mdc`:

```
<type>(<scope>): <subject>

[optional body]

[optional footer: Closes #issue]
```

Scopes: `scaffold`, `core`, `checklist`, `checker`, `reflection`, `reporter`, `orchestrator`, `cli`, `adr`

### PR Size Contract

- **Max 400 lines** per PR (excluding test fixtures and generated files)
- Every PR has at least one failing test committed before the implementation commit
- PR title format: `[MOD-08] <type>: <short description>`

### Test Coverage Gates

| Metric | Threshold |
|--------|-----------|
| Line coverage | ≥ 80% |
| Branch coverage | ≥ 80% |

### Definition of Done (per Phase)

- [ ] All tests pass
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` produces no errors
- [ ] PR is self-reviewed
- [ ] ADR linked if an architectural decision was made
- [ ] No `any`, no `@ts-ignore`
- [ ] No `console.log` in production code

---

## Dependency Map (PR Order)

```
Phase 0 (scaffold)
  └── Phase 1 (core types + module interfaces)
        ├── Phase 2 (checklist parser)  ─┐
        ├── Phase 3 (deterministic checker) ← needs Phase 2
        ├── Phase 4 (reflection engine) ─┤
        └── Phase 5 (reporter)          ─┤
              └── All above → Phase 6 (orchestrator)
                                └── Phase 7 (CLI entry)
```

Phases 2, 4, and 5 are **independent after Phase 1** and can be developed in parallel.
Phase 3 depends on Phase 2 (needs parsed checklist).
Phase 6 requires all prior phases.

---

## Branch Naming Convention

```
chore/project-scaffold
feat/core-types
feat/checklist-parser
feat/deterministic-checker
feat/reflection-engine
feat/reporter
feat/pulse-orchestrator
feat/cli-entry
```

---

## Verification

After all phases are complete:

1. `npm run typecheck` — zero errors
2. `npm run test` — all unit tests pass
3. `npm run test:coverage` — meets 80% thresholds
4. `npm run test:integration` — full lifecycle tests pass
5. `npm run build` — compiles to `dist/`
6. Manual: `node dist/cli.js --dry-run --heartbeat-file ./HEARTBEAT.md` — produces HeartbeatReport JSON
7. Manual: Verify CLAUDE.md has project-specific section with accurate info
