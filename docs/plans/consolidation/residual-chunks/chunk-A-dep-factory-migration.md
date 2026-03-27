# Chunk A: Dep-Factory Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `session.ts` and `run.ts` from `createCliDeps()` to `createBeastDeps()`, wiring all Phase 2-7 consolidation components into the production runtime.

**Architecture:** `createBeastDeps()` already exists with 6 adapters wrapping new components behind old `BeastLoopDeps` ports. The migration strategy is: build a bridge function that maps old `CliDepOptions` + `SessionConfig` into `BeastDepsConfig` + `ExistingDeps`, then replace `createCliDeps()` calls one at a time. Once all callers are migrated, delete old stubs and superseded code.

**Tech Stack:** TypeScript, Vitest, Hono, SQLite (better-sqlite3)

**Resolves:** Phase 1.1, Phase 8 M1, Phase 3 M1/M2, Phase 4 M1/M2, Phase 4.5 M1/M2, Phase 5 M1/M2, Phase 6 M1, Phase 7 M1/M2

---

## File Map

### Create
- `packages/franken-orchestrator/src/cli/dep-bridge.ts` — Maps old `CliDepOptions` to `BeastDepsConfig` + `ExistingDeps`
- `packages/franken-orchestrator/tests/unit/cli/dep-bridge.test.ts`
- `packages/franken-orchestrator/tests/unit/cli/session-migration.test.ts` — Verifies session phases work with new deps

### Modify
- `packages/franken-orchestrator/src/cli/session.ts` — Replace `createCliDeps()` calls with `createBeastDeps()` via bridge
- `packages/franken-orchestrator/src/cli/run.ts` — Replace `createCliDeps()` import and calls
- `packages/franken-orchestrator/src/cli/create-beast-deps.ts` — Add `comms` config field, wire token aggregation callback
- `packages/franken-orchestrator/src/cli/run-config-v2.ts` — Add `comms` field to schema
- `packages/franken-orchestrator/src/http/chat-app.ts` — Mount skill routes
- `packages/franken-orchestrator/src/http/chat-server.ts` — Add `commsConfig` + `commsRuntime` pass-through
- `packages/franken-orchestrator/src/comms/core/chat-runtime-comms-adapter.ts` — Remove `as unknown` cast once fields exist

### Delete (after migration complete)
- `packages/franken-orchestrator/src/cli/dep-factory.ts` — Old factory
- `packages/franken-orchestrator/src/adapters/episodic-memory-port-adapter.ts` — Superseded by `brain-memory-adapter.ts`
- `packages/franken-orchestrator/src/skills/providers/cli-provider.ts` — Old provider registry
- `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`
- `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`

### Test
- `packages/franken-orchestrator/tests/unit/cli/dep-bridge.test.ts`
- `packages/franken-orchestrator/tests/unit/cli/session-migration.test.ts`
- Existing session/run tests updated to work with new deps

---

## Tasks

### Task 1: Bridge Function (CliDepOptions → BeastDepsConfig)

**Files:**
- Create: `src/cli/dep-bridge.ts`
- Test: `tests/unit/cli/dep-bridge.test.ts`

The bridge maps old-world config shapes to new-world shapes so session.ts/run.ts can migrate incrementally.

- [ ] **Step 1:** Write failing test — bridge converts provider string to ProviderConfig array
- [ ] **Step 2:** Run test to verify it fails
- [ ] **Step 3:** Implement `bridgeToBeastDepsConfig()` — maps `CliDepOptions.provider` + `providers` + `providersConfig` → `ProviderConfig[]`
- [ ] **Step 4:** Run test to verify it passes
- [ ] **Step 5:** Write failing test — bridge maps security tier to security profile
- [ ] **Step 6:** Implement security mapping (`STRICT` → `strict`, etc.)
- [ ] **Step 7:** Write failing test — bridge creates `ExistingDeps` with stubs for planner, critique, governor
- [ ] **Step 8:** Implement ExistingDeps construction (dynamic imports for critique/governor matching old dep-factory pattern)
- [ ] **Step 9:** Write failing test — bridge passes through optional deps (graphBuilder, prCreator, checkpoint, etc.)
- [ ] **Step 10:** Implement pass-through
- [ ] **Step 11:** Commit

### Task 2: Add comms field to RunConfigV2

**Files:**
- Modify: `src/cli/run-config-v2.ts`
- Test: `tests/unit/cli/run-config-v2.test.ts`

- [ ] **Step 1:** Write failing test — RunConfigV2 accepts `comms` field
- [ ] **Step 2:** Add `CommsRunConfigSchema` import and `comms` field to `RunConfigV2Schema`
- [ ] **Step 3:** Run test to verify it passes
- [ ] **Step 4:** Commit

### Task 3: Wire token aggregation into createBeastDeps

**Files:**
- Modify: `src/cli/create-beast-deps.ts`
- Test: `tests/unit/cli/create-beast-deps.test.ts`

Resolves Phase 3 M2 — ProviderRegistry token usage flows to BudgetTrigger.

- [ ] **Step 1:** Write failing test — ConsolidatedDeps exposes `getTokenUsage()` callback
- [ ] **Step 2:** Add `onTokenUsage` callback option to `BeastDepsConfig`
- [ ] **Step 3:** Wire `registry.getTokenUsage()` into the returned deps
- [ ] **Step 4:** Run tests, commit

### Task 4: Migrate session.ts — Interview phase

**Files:**
- Modify: `src/cli/session.ts`
- Test: `tests/unit/cli/session-migration.test.ts`

Start with interview phase (simplest — only uses `cliLlmAdapter`).

- [ ] **Step 1:** Write test — interview phase creates deps via bridge and produces an adapter
- [ ] **Step 2:** Replace `createCliDeps()` call in `runInterview()` with bridge + `createBeastDeps()`
- [ ] **Step 3:** Verify existing session tests still pass
- [ ] **Step 4:** Commit

### Task 5: Migrate session.ts — Plan phase

**Files:**
- Modify: `src/cli/session.ts`

- [ ] **Step 1:** Replace `createCliDeps()` in `runPlan()` with bridge
- [ ] **Step 2:** Verify tests pass
- [ ] **Step 3:** Commit

### Task 6: Migrate session.ts — Execute phase

**Files:**
- Modify: `src/cli/session.ts`

The execute phase uses the full BeastLoopDeps bag. This is the critical migration.

- [ ] **Step 1:** Replace `createCliDeps()` in `runExecute()` with bridge + `createBeastDeps()`
- [ ] **Step 2:** Wire AuditTrail persistence in closure (resolves Phase 7 M1)
- [ ] **Step 3:** Verify full session flow tests pass
- [ ] **Step 4:** Commit

### Task 7: Migrate run.ts

**Files:**
- Modify: `src/cli/run.ts`

run.ts calls `createCliDeps()` for chat surface deps and delegates to Session.

- [ ] **Step 1:** Replace `createCliDeps` import with bridge + `createBeastDeps`
- [ ] **Step 2:** Update `createChatSurfaceDeps()` to use new factory
- [ ] **Step 3:** Wire `RunConfigV2` loading into the startup path
- [ ] **Step 4:** Verify run tests pass
- [ ] **Step 5:** Commit

### Task 8: Mount skill routes in chat-app

**Files:**
- Modify: `src/http/chat-app.ts`
- Modify: `src/http/chat-server.ts`

Resolves Phase 5 M1 — skill management API available at `/api/skills`.

- [ ] **Step 1:** Write failing test — chat app mounts `/api/skills` routes when skillManager provided
- [ ] **Step 2:** Add `skillManager?: SkillManager` to `ChatAppOptions`
- [ ] **Step 3:** Conditionally mount `createSkillRoutes()` in `createChatApp()`
- [ ] **Step 4:** Pass skillManager from `startChatServer()` options
- [ ] **Step 5:** Run tests, commit

### Task 9: Wire commsConfig in startChatServer

**Files:**
- Modify: `src/http/chat-server.ts`

Resolves Phase 1.1 — comms routes activated when commsConfig present.

- [ ] **Step 1:** Add `commsConfig` and `commsRuntime` to `StartChatServerOptions`
- [ ] **Step 2:** Pass them to `createChatApp()`
- [ ] **Step 3:** Run tests, commit

### Task 10: Delete old dep-factory and superseded code

**Files:**
- Delete: `src/cli/dep-factory.ts`
- Delete: `src/adapters/episodic-memory-port-adapter.ts`
- Delete: `src/skills/providers/cli-provider.ts`
- Delete: `tests/unit/cli/dep-factory-providers.test.ts`
- Delete: `tests/integration/cli/dep-factory-wiring.test.ts`
- Modify: `src/index.ts` — Remove old exports

- [ ] **Step 1:** Delete old files
- [ ] **Step 2:** Remove stale imports and exports from `index.ts`
- [ ] **Step 3:** Fix any remaining import references across codebase
- [ ] **Step 4:** Run full test suite
- [ ] **Step 5:** Commit

### Task 11: Scrutinize and document

- [ ] **Step 1:** Run `npm test` and `npm run typecheck` across monorepo
- [ ] **Step 2:** Verify all Phase 3-7 M-items are resolved
- [ ] **Step 3:** Update residual files to mark resolved items
- [ ] **Step 4:** Document any new residuals
- [ ] **Step 5:** Final commit

---

## Key Risks

1. **Dynamic imports in old dep-factory** — critique and governor modules are loaded with `try/catch` dynamic `import()`. The bridge must replicate this for ExistingDeps construction.
2. **Session state management** — `CliSkillExecutor`, `MartinLoop`, `GitBranchIsolator` are created inside `createCliDeps()`. These must be constructed separately or passed as ExistingDeps fields.
3. **Test breakage scope** — session.test.ts, run.test.ts, and integration tests mock `createCliDeps()`. All mocks must be updated.
4. **Provider adapter compatibility** — Old `CliLlmAdapter` wraps individual providers with retry/timeout. New `ProviderRegistry` handles retry internally. Must verify retry behavior is preserved.
