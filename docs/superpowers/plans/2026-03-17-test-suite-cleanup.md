# Test Suite Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ~297 fluff tests, rewrite ~100 mock-heavy tests to test real behavior, fill 9 of 14 critical untested paths (5 deferred — see audit), and establish lint rules to prevent recurrence.

**Architecture:** Three phases: (1) Delete pure fluff files — zero behavioral change, just removal. (2) Rewrite mock-heavy tests to exercise real code paths and fill critical gaps. (3) Add a CI lint gate to prevent fluff patterns from returning. Each chunk within a phase is independent and parallelizable.

**Tech Stack:** TypeScript, vitest, eslint (custom rules), grep-based CI checks

**Audit:** `docs/test-suite-audit-2026-03-17.md`

---

## Phase Overview

| Phase | Chunks | Tests Removed | Tests Added | Net Change |
|-------|--------|---------------|-------------|------------|
| 1: Delete Fluff | 6 chunks (parallel) | ~297 | 0 | -297 |
| 2: Rewrite & Fill Gaps | 8 chunks (parallel) | ~100 | ~120 | +20 |
| 3: Prevention | 1 chunk | 0 | 0 | 0 |
| **Total** | **15** | **~397** | **~120** | **-277** |

Post-cleanup target: ~2,264 tests, ~90% meaningful.

---

## Dependency Graph

```
Phase 1 (all parallel, no deps):
  Chunk 01: Delete type facade files
  Chunk 02: Delete doc content tests
  Chunk 03: Delete migration/smoke tests
  Chunk 04: Delete orchestrator fluff files
  Chunk 05: Delete error inheritance fluff (partial file edits)
  Chunk 06: Delete config/Zod-testing fluff (partial file edits)

Phase 2 (all parallel, depends on Phase 1 complete):
  Chunk 07: Rewrite brain mock-heavy tests
  Chunk 08: Rewrite heartbeat mock-heavy tests
  Chunk 09: Rewrite observer GrafanaDashboard + adapter fluff
  Chunk 10: Rewrite critique reviewer + evaluator interface fluff
  Chunk 11: Rewrite orchestrator adapter/context/config tests
  Chunk 12: Fill security gaps (Slack timingSafeEqual, comms error paths)
  Chunk 13: Fill critical e2e gaps (budget-exceeded, mid-flow injection, ChatGateway)
  Chunk 14: Fill concurrency & boundary gaps (retry backoff, PII redact, async breaker)

Phase 3 (depends on Phase 2 complete):
  Chunk 15: CI lint gate for fluff prevention
```

---

## Phase 1: Delete Pure Fluff

All chunks in this phase are independent. Each chunk deletes files or removes specific tests. Run `npm test` after each chunk to confirm no regressions.

---

### Chunk 01: Delete Type Facade Files

**Goal:** Remove all `expectTypeOf`-only test files across core packages. These test TypeScript's compiler, not our code.

**Files to delete:**
- `packages/franken-critique/tests/unit/types/types.test.ts`
- `packages/franken-types/tests/unit/types.test.ts`
- `packages/franken-types/tests/unit/ids.test.ts`
- `packages/franken-mcp/src/types/mcp-types.test.ts`
- `packages/franken-governor/tests/unit/core/types.test.ts`
- `packages/franken-skills/src/types/unified-skill-contract.test.ts`
- `packages/franken-skills/src/registry/i-skill-registry.test.ts`
- `packages/frankenfirewall/src/adapters/i-adapter.test.ts`
- `packages/frankenfirewall/src/types/guardrail-violation.test.ts`
- `packages/frankenfirewall/src/types/unified-request.test.ts`
- `packages/frankenfirewall/src/types/unified-response.test.ts`
- `packages/franken-planner/tests/unit/index.test.ts`

- [ ] **Step 1: Delete all 12 files**

```bash
rm packages/franken-critique/tests/unit/types/types.test.ts
rm packages/franken-types/tests/unit/types.test.ts
rm packages/franken-types/tests/unit/ids.test.ts
rm packages/franken-mcp/src/types/mcp-types.test.ts
rm packages/franken-governor/tests/unit/core/types.test.ts
rm packages/franken-skills/src/types/unified-skill-contract.test.ts
rm packages/franken-skills/src/registry/i-skill-registry.test.ts
rm packages/frankenfirewall/src/adapters/i-adapter.test.ts
rm packages/frankenfirewall/src/types/guardrail-violation.test.ts
rm packages/frankenfirewall/src/types/unified-request.test.ts
rm packages/frankenfirewall/src/types/unified-response.test.ts
rm packages/franken-planner/tests/unit/index.test.ts
```

- [ ] **Step 2: Remove any empty parent directories**

Check if `packages/franken-critique/tests/unit/types/`, `packages/frankenfirewall/src/types/` are now empty and remove if so.

- [ ] **Step 3: Run affected package tests to confirm no regressions**

```bash
npx turbo run test --filter=franken-critique --filter=franken-types --filter=franken-mcp --filter=franken-governor --filter=franken-skills --filter=frankenfirewall --filter=franken-planner
```

Expected: All pass. Test count drops by ~105.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "test: delete expectTypeOf facade tests across 7 packages

These tests duplicated TypeScript compiler checks at runtime.
Zero behavioral coverage lost — tsc --noEmit catches all of these.

Removes ~105 tests.

Ref: docs/test-suite-audit-2026-03-17.md (Disease 1)"
```

---

### Chunk 02: Delete Documentation Content Tests

**Goal:** Remove all root-level test files that grep markdown files for keyword presence. These test documentation, not code.

**Files to delete:**
- `tests/integration/docs-pluggable-providers.test.ts`
- `tests/integration/docs-gap-closure.test.ts`
- `tests/integration/docs-adr.test.ts`
- `tests/unit/docs/docs-issues-content.test.ts`
- `tests/unit/docs/docs-monorepo-layout.test.ts`
- `tests/integration/cross-module-contracts.test.ts`

- [ ] **Step 1: Delete all 6 files**

```bash
rm tests/integration/docs-pluggable-providers.test.ts
rm tests/integration/docs-gap-closure.test.ts
rm tests/integration/docs-adr.test.ts
rm tests/unit/docs/docs-issues-content.test.ts
rm tests/unit/docs/docs-monorepo-layout.test.ts
rm tests/integration/cross-module-contracts.test.ts
```

- [ ] **Step 2: Remove empty `tests/unit/docs/` directory if empty**

```bash
rmdir tests/unit/docs/ 2>/dev/null || true
```

- [ ] **Step 3: Run root integration tests**

```bash
npx vitest run --config vitest.config.ts
```

Expected: All pass. Test count drops by ~133.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "test: delete documentation content tests

These tested that markdown files contain keywords, not that code works.
Docs could be completely wrong about the code and every test would pass.
cross-module-contracts.test.ts was 82% TypeScript shape checks.

Removes ~133 tests.

Ref: docs/test-suite-audit-2026-03-17.md (Disease 3, 4)"
```

---

### Chunk 03: Delete Migration and Smoke Tests

**Goal:** Remove post-migration filesystem checks and trivial smoke tests.

**Files to delete:**
- `tests/cleanup-old-dirs.test.ts`
- `packages/franken-governor/tests/unit/smoke.test.ts`
- `packages/franken-heartbeat/tests/unit/smoke.test.ts`
- `packages/franken-brain/tests/unit/smoke.test.ts`
- `packages/franken-governor/tests/unit/gateway/governor-factory.test.ts`

- [ ] **Step 1: Delete all 5 files**

```bash
rm tests/cleanup-old-dirs.test.ts
rm packages/franken-governor/tests/unit/smoke.test.ts
rm packages/franken-heartbeat/tests/unit/smoke.test.ts
rm packages/franken-brain/tests/unit/smoke.test.ts
rm packages/franken-governor/tests/unit/gateway/governor-factory.test.ts
```

- [ ] **Step 2: Run tests**

```bash
npx turbo run test --filter=franken-governor --filter=franken-heartbeat --filter=franken-brain
npx vitest run --config vitest.config.ts
```

Expected: All pass. Test count drops by ~28.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "test: delete smoke tests and post-migration filesystem checks

smoke.test.ts files tested 1+1=2 and version string constants.
cleanup-old-dirs.test.ts checked pre-monorepo dirs don't exist.
governor-factory.test.ts only checked typeof === 'function'.

Removes ~28 tests.

Ref: docs/test-suite-audit-2026-03-17.md (Disease 4)"
```

---

### Chunk 04: Delete Orchestrator Fluff Files

**Goal:** Remove type facade and placeholder files in the orchestrator package.

**Files to delete:**
- `packages/franken-orchestrator/tests/unit/issues/types.test.ts`
- `packages/franken-orchestrator/tests/unit/beasts/types.test.ts`
- `packages/franken-orchestrator/tests/unit/http/ws-chat-types.test.ts`
- `packages/franken-orchestrator/tests/unit/cli/dep-factory-module-toggles.test.ts`
- `packages/franken-orchestrator/tests/unit/config/orchestrator-config-providers.test.ts`

**Files to gut (remove fluff tests, keep meaningful ones):**
- `packages/franken-orchestrator/tests/unit/chat/types.test.ts` — delete entirely (12 tests, 58% fluff, rest borderline)
- `packages/franken-orchestrator/tests/unit/skills/cli-types.test.ts` — delete entirely (12 tests, 58% fluff, rest borderline)

- [ ] **Step 1: Delete all 7 files**

```bash
rm packages/franken-orchestrator/tests/unit/issues/types.test.ts
rm packages/franken-orchestrator/tests/unit/beasts/types.test.ts
rm packages/franken-orchestrator/tests/unit/http/ws-chat-types.test.ts
rm packages/franken-orchestrator/tests/unit/cli/dep-factory-module-toggles.test.ts
rm packages/franken-orchestrator/tests/unit/config/orchestrator-config-providers.test.ts
rm packages/franken-orchestrator/tests/unit/chat/types.test.ts
rm packages/franken-orchestrator/tests/unit/skills/cli-types.test.ts
```

- [ ] **Step 2: Run orchestrator tests**

```bash
npx turbo run test --filter=franken-orchestrator
```

Expected: All pass. Test count drops by ~65.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "test: delete orchestrator type facades and placeholder tests

issues/types, beasts/types, chat/types, skills/cli-types: expectTypeOf
ws-chat-types: Zod parse tests
dep-factory-module-toggles: expect(true).toBe(true) placeholders
orchestrator-config-providers: 86% Zod schema validation

Removes ~65 tests.

Ref: docs/test-suite-audit-2026-03-17.md"
```

---

### Chunk 05: Trim Error Inheritance Tests

**Goal:** Remove `instanceof Error`, `instanceof ParentError` tests from error test files across 3 packages. Keep only the `name` property tests (marginal value for debuggability) and `cause` chaining tests.

**Files to edit (not delete):**
- `packages/franken-governor/tests/unit/errors/errors.test.ts` — remove 10 of 15 tests (keep 5: name checks + cause)
- `packages/franken-heartbeat/tests/unit/core/errors.test.ts` — remove 6 of 9 tests (keep 3: name checks)
- `packages/franken-critique/tests/unit/errors/errors.test.ts` — remove 9 of 12 tests (keep 3: cause chaining + 2 name)

- [ ] **Step 1: Read each file, identify which `describe` blocks to remove**

For each file, remove all tests named:
- `"is an instance of Error"`
- `"is an instance of GovernorError"` / `"is an instance of CritiqueError"` / `"is an instance of HeartbeatError"`
- `"has message, code, and name"` (when duplicated by name-specific tests)
- `"has empty context by default"` (default parameter tests)

Keep:
- `"has correct code and name"` (one per error class)
- `"chains cause"` or `"accepts cause"`
- `"accepts context"` (if it tests a non-default path)

- [ ] **Step 2: Edit governor errors.test.ts**

In each of the 5 error class describe blocks, remove ONLY the `"is an instance of Error"` test and the `"is an instance of GovernorError"` test. Keep both the name property test AND any behavioral property tests (e.g., `"carries requestId and timeoutMs"`, `"carries triggerId"`). Net removal: 10 tests, keeping 5.

- [ ] **Step 3: Edit heartbeat errors.test.ts**

Same pattern. Remove instanceof tests, keep name tests.

- [ ] **Step 4: Edit critique errors.test.ts**

Remove instanceof tests and `"has empty context by default"`. Keep `"chains cause"` and name checks.

- [ ] **Step 5: Run affected tests**

```bash
npx turbo run test --filter=franken-governor --filter=franken-heartbeat --filter=franken-critique
```

Expected: All pass. Test count drops by ~25.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "test: trim error class inheritance tests across 3 packages

Removed instanceof Error/ParentError checks — TypeScript class
inheritance guarantees these. Kept name property and cause-chaining tests.

Removes ~25 tests.

Ref: docs/test-suite-audit-2026-03-17.md (Disease 2)"
```

---

### Chunk 06: Trim Config and Constant Tests

**Goal:** Remove Zod-testing and constant-checking tests from config files and trigger files.

**Files to edit:**
- `packages/franken-governor/tests/unit/core/config.test.ts` — **delete entirely** (4 tests, all check numbers > 0)
- `packages/franken-orchestrator/tests/unit/config/orchestrator-config.test.ts` — remove 4 of 7 tests (keep "rejects negative token budget", "rejects out-of-range critique score", and one boundary test)
- `packages/franken-orchestrator/tests/unit/context/franken-context.test.ts` — remove 4 of 7 tests (keep "tracks elapsed time", "addAudit", and one mutation test that isn't just set/get)
- Remove `"has triggerId '<name>'"` from all 4 trigger test files in governor (1 test each):
  - `packages/franken-governor/tests/unit/triggers/budget-trigger.test.ts`
  - `packages/franken-governor/tests/unit/triggers/ambiguity-trigger.test.ts`
  - `packages/franken-governor/tests/unit/triggers/skill-trigger.test.ts`
  - `packages/franken-governor/tests/unit/triggers/confidence-trigger.test.ts`
- Remove `"implements Evaluator interface"` from all 8 evaluator test files in critique (1 test each):
  - `packages/franken-critique/tests/unit/evaluators/conciseness.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/scalability.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/logic-loop.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/adr-compliance.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/complexity.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/factuality.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/safety.test.ts`
  - `packages/franken-critique/tests/unit/evaluators/ghost-dependency.test.ts`

- [ ] **Step 1: Delete governor config.test.ts**

```bash
rm packages/franken-governor/tests/unit/core/config.test.ts
```

- [ ] **Step 2: Edit orchestrator-config.test.ts — remove 4 fluff tests**

Remove: `"provides sensible defaults"`, `"accepts valid partial overrides"`, `"accepts boundary values"`. Keep: `"rejects negative token budget"`, `"rejects out-of-range critique score"`, and any test that exercises a real behavioral boundary.

- [ ] **Step 3: Edit franken-context.test.ts — remove 4 getter/setter tests**

Remove: `"initialises with correct defaults"`, `"allows mutation of phase and tokenSpend"`, `"allows setting sanitizedIntent"`. Keep: `"tracks elapsed time"` and `"generates sessionId when not provided"` (tests UUID generation, not a getter).

- [ ] **Step 4: Edit 4 trigger test files — remove triggerId constant tests**

In each file, find and remove the `it("has triggerId '<name>'", ...)` test.

- [ ] **Step 5: Edit 8 evaluator test files — remove interface check tests**

In each file, find and remove the `it("implements Evaluator interface", ...)` test.

- [ ] **Step 6: Run affected tests**

```bash
npx turbo run test --filter=franken-governor --filter=franken-critique --filter=franken-orchestrator
```

Expected: All pass. Test count drops by ~20.

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "test: trim constant checks, Zod-testing, and interface existence tests

Removed triggerId string constant tests (4), evaluator interface
checks (8), Zod default validation tests, and getter/setter tests.

Removes ~20 tests.

Ref: docs/test-suite-audit-2026-03-17.md (Disease 5)"
```

---

## Phase 2: Rewrite and Fill Gaps

All chunks in this phase are independent and can run in parallel. Each replaces mock-heavy tests with real behavior tests or fills critical untested paths.

**Important for implementors:** These are TDD rewrites. Write the new test first, confirm it exercises real code (not just mocks), then remove the old fluff test it replaces.

---

### Chunk 07: Rewrite Brain Mock-Heavy Tests

**Goal:** Replace delegation-via-mock tests in franken-brain with tests that exercise real logic.

**Files to edit:**
- `packages/franken-brain/tests/unit/pii/pii-guarded-stores.test.ts`
- `packages/franken-brain/tests/unit/compression/episodic-lesson-extractor.test.ts`
- `packages/franken-brain/tests/unit/types/memory.test.ts`

**Changes for `pii-guarded-stores.test.ts`:**

- [ ] **Step 1: Remove 2 delegation-via-mock tests**

Remove: `"delegates record() to inner store when scanner returns clean"`, `"delegates upsert() to inner store when scanner returns clean"`.

Keep: `"passes through read-only methods (query, count, etc.) without scanning"` and `"passes through search, delete, deleteCollection without scanning"` — these test a meaningful behavioral contract (no PII scanning for reads).

- [ ] **Step 2: Add test for `redact` mode (currently untested)**

Write a test that creates a `PiiGuardedEpisodicStore` in `redact` mode, records a trace containing PII, and verifies:
- The inner store IS called (unlike block mode)
- The stored data has PII replaced with placeholders
- No error is thrown

- [ ] **Step 3: Add test for scanner throwing**

Write a test where `scanner.scan()` rejects with an error. Verify the guarded store propagates the error (doesn't silently swallow).

- [ ] **Step 4: Run tests, verify pass**

```bash
npx turbo run test --filter=franken-brain
```

- [ ] **Step 5: Commit**

**Changes for `episodic-lesson-extractor.test.ts`:**

- [ ] **Step 6: Remove 4 fluff tests**

Remove: `"returns a SemanticChunk with type=\"semantic\""`, `"returned chunk source is \"lesson-learned\""`, `"returned chunk content is the LLM response"`, `"returned chunk status is \"success\""`.

- [ ] **Step 7: Add test for empty LLM response**

Write a test where `llmClient.complete()` returns `""`. Verify the extractor either throws or returns a chunk with empty content (document whichever behavior exists).

- [ ] **Step 8: Add test for multiple traces with different projectIds**

Write a test with 2 failure traces from different projects. Verify which projectId wins in the returned chunk.

- [ ] **Step 9: Run tests, commit**

```bash
npx turbo run test --filter=franken-brain
git add -u
git commit -m "test(brain): replace mock-delegation tests with behavioral tests

Removed 8 mock-setup-is-the-test patterns from pii-guarded-stores
and episodic-lesson-extractor. Added: redact mode, scanner error
propagation, empty LLM response, multi-project traces."
```

**Changes for `memory.test.ts`:**

- [ ] **Step 10: Remove 5 expectTypeOf/construction tests**

Remove all tests that construct a typed object and assert its properties equal what was just written.

- [ ] **Step 11: Add cross-variant parse test**

Write a test that passes `{ type: 'working', taskId: 'task-1' }` to `parseMemoryEntry` — this has the wrong fields for a `working` variant (should have `role`, not `taskId`). Verify it throws.

- [ ] **Step 12: Run tests, commit**

```bash
npx turbo run test --filter=franken-brain
git add -u
git commit -m "test(brain): replace memory type construction tests with parse edge cases"
```

---

### Chunk 08: Rewrite Heartbeat Mock-Heavy Tests

**Goal:** Replace keyword-presence and stub-testing tests with behavioral tests.

**Files to edit:**
- `packages/franken-heartbeat/tests/unit/reflection/prompt-builder.test.ts`
- `packages/franken-heartbeat/tests/unit/reflection/llm-agnostic.test.ts`
- `packages/franken-heartbeat/tests/unit/cli/run.test.ts`

**Changes for `prompt-builder.test.ts`:**

- [ ] **Step 1: Remove 4 keyword-presence tests**

Remove: `"includes pattern analysis section"`, `"includes improvement suggestion section"`, `"includes tech debt scan section"`, `"requests JSON response format"`. These only check that generic words like "patterns" appear somewhere in the prompt.

- [ ] **Step 2: Add test for zero-data prompt**

Write a test with 0 traces and 0 failures. Verify the prompt degrades gracefully (contains a meaningful instruction even with no data).

- [ ] **Step 3: Add test for prompt token estimation**

Write a test with a known number of traces/failures and verify the prompt's approximate length is within the expected budget.

- [ ] **Step 4: Run tests, commit**

```bash
npx turbo run test --filter=franken-heartbeat
git add -u
git commit -m "test(heartbeat): replace keyword-presence prompt tests with structural tests"
```

**Changes for `llm-agnostic.test.ts`:**

- [ ] **Step 5: Delete the file entirely**

This file duplicates `reflection-engine.test.ts` and `response-parser.test.ts` with no additive coverage. The one unique test (markdown code block format) already exists in `response-parser.test.ts`.

```bash
rm packages/franken-heartbeat/tests/unit/reflection/llm-agnostic.test.ts
```

- [ ] **Step 6: Run tests, commit**

**Changes for `run.test.ts`:**

- [ ] **Step 7: Remove 6 "CLI stubs" tests**

Remove the entire `describe("CLI stubs")` block that tests stub implementations return hardcoded values.

- [ ] **Step 8: Run tests, commit**

```bash
npx turbo run test --filter=franken-heartbeat
git add -u
git commit -m "test(heartbeat): delete llm-agnostic duplication and stub-testing-stubs block"
```

---

### Chunk 09: Rewrite Observer GrafanaDashboard + Adapter Fluff

**Goal:** Remove typeof/shape checks from GrafanaDashboard tests and copy-paste write-only adapter tests.

**Files to edit:**
- `packages/franken-observer/src/grafana/GrafanaDashboard.test.ts`
- `packages/franken-observer/src/adapters/langfuse/LangfuseAdapter.test.ts`
- `packages/franken-observer/src/adapters/tempo/TempoAdapter.test.ts`

**Changes for `GrafanaDashboard.test.ts`:**

- [ ] **Step 1: Remove 9 typeof/shape-check tests**

Remove: `"returns a non-null object"`, `"has a schemaVersion field"`, `"has a timezone field"`, `"has a time range with from and to"`, `"has a refresh interval"`, `"output is JSON-serialisable"`, `"id is null"`, `"returns at least one panel"`, `"panels include at least one timeseries panel"` / `"stat panel"`.

- [ ] **Step 2: Run tests, commit**

**Changes for adapter files:**

- [ ] **Step 3: Remove copy-paste write-only tests from Langfuse and Tempo**

From each: remove `"queryByTraceId() returns null"`, `"listTraceIds() returns []"`, `"uses HTTP POST method"`, `"sends Content-Type: application/json"`.

- [ ] **Step 4: Add error-path test to each adapter**

In both Langfuse and Tempo test files, add a test where `fetch` rejects (network error). Verify the adapter propagates the error with a useful message.

- [ ] **Step 5: Run tests, commit**

```bash
npx turbo run test --filter=franken-observer
git add -u
git commit -m "test(observer): remove dashboard shape checks and adapter boilerplate

Removed 9 GrafanaDashboard typeof tests and 8 copy-paste write-only
adapter tests. Added network error path tests for Langfuse and Tempo."
```

---

### Chunk 10: Rewrite Critique Reviewer + Evaluator Fluff

**Goal:** Replace `typeof reviewer.review === 'function'` tests with behavioral tests.

**Files to edit:**
- `packages/franken-critique/tests/unit/reviewer.test.ts`

- [ ] **Step 1: Remove 3 fluff tests**

Remove: `"returns a Reviewer with a review method"`, `"accepts custom knownPackages list"`, `"accepts observability port for token budget breaker"`.

- [ ] **Step 2: Add test for pipeline error propagation**

Write a test where one evaluator throws (not returns fail — actually throws). Verify the pipeline catches it and includes it in the result rather than crashing.

- [ ] **Step 3: Add test for async breaker path**

Write a test where `TokenBudgetBreaker` is wired with a real `checkAsync` that trips. Verify the loop halts with the correct verdict.

- [ ] **Step 4: Run tests, commit**

```bash
npx turbo run test --filter=franken-critique
git add -u
git commit -m "test(critique): replace reviewer existence checks with error propagation and async breaker tests"
```

---

### Chunk 11: Rewrite Orchestrator Adapter/Context/Config Tests

**Goal:** Remove instanceof/typeof checks from cli-observer-bridge, and getter/setter tests from context.

**Files to edit:**
- `packages/franken-orchestrator/tests/unit/adapters/cli-observer-bridge.test.ts`

- [ ] **Step 1: Remove 6 fluff tests**

Remove: `"creates internal TokenCounter, CostCalculator, CircuitBreaker, LoopDetector"`, `"implements IObserverModule"`, `"initializes a trace context"` (if only checking id is non-empty), `"returns an object with end() method"`, `"returns estimated cost from internal CostCalculator"` (if only checking >= 0 with zero tokens), `"exposes counter, costCalc, breaker, loopDetector properties"`.

- [ ] **Step 2: Add test for double startTrace call**

Write a test that calls `startTrace` twice. Document whether it creates a new trace or throws.

- [ ] **Step 3: Run tests, commit**

```bash
npx turbo run test --filter=franken-orchestrator
git add -u
git commit -m "test(orchestrator): remove adapter instanceof checks, add double-startTrace edge case"
```

---

### Chunk 12: Fill Security Gaps

**Goal:** Fix the Slack timing-safe comparison vulnerability and add missing comms error path tests.

**Files to modify:**
- `packages/franken-comms/src/security/slack-signature.ts` (or wherever the middleware lives)
- `packages/franken-comms/tests/unit/security/slack-signature.test.ts`
- `packages/franken-comms/tests/unit/chat-gateway.test.ts`

- [ ] **Step 1: Verify Slack timingSafeEqual is tested**

Read `packages/franken-comms/src/security/slack-signature.ts` — it already uses `timingSafeEqual` (confirmed during review). Read `packages/franken-comms/tests/unit/security/slack-signature.test.ts` and confirm there is a test exercising the timing-safe comparison. If not, add one that verifies invalid signatures are rejected (which implicitly exercises the comparison path).

Note: The audit flagged this as a vulnerability but the implementation was already correct at time of plan writing. No implementation change needed.

- [ ] **Step 2: Run test, verify pass**

- [ ] **Step 4: Add ChatGateway.handleAction tests**

Read `packages/franken-comms/src/chat-gateway.ts`. Add tests for:
- `handleAction('approve')` calls `bridge.respondToApproval(true)`
- `handleAction('reject')` calls `bridge.respondToApproval(false)`
- `handleAction` with unknown `actionId` throws
- `handleAction` for unknown `sessionId` throws

- [ ] **Step 5: Add comms adapter error path tests**

For each adapter (`slack-adapter.test.ts`, `discord-adapter.test.ts`, `telegram-adapter.test.ts`, `whatsapp-adapter.test.ts`): add one test where `fetch` returns `{ ok: false, status: 500 }` and verify the adapter throws with a useful error message.

- [ ] **Step 6: Run tests, commit**

```bash
npx turbo run test --filter=franken-comms
git add -u
git commit -m "test(comms): add ChatGateway.handleAction tests and adapter error paths

Adds tests for approve/reject action routing, unknown action/session
error paths, and HTTP failure handling for all 4 channel adapters.
Verified Slack timingSafeEqual is already correctly implemented."
```

---

### Chunk 13: Fill Critical E2E Gaps

**Goal:** Add the three most dangerous missing e2e scenarios.

**Files to create/modify:**
- `packages/franken-orchestrator/tests/e2e/budget-exceeded.test.ts` (rewrite)
- `packages/franken-orchestrator/tests/e2e/injection-midflow.test.ts` (add test)
- `packages/franken-comms/tests/unit/chat-gateway.test.ts` (if not covered in Chunk 12)

- [ ] **Step 1: Read existing budget-exceeded.test.ts**

Understand the current test factory setup.

- [ ] **Step 2: Add actual budget-exceeded abort test**

Write a test where:
- The observer mock's `getTokenSpend` returns a value that exceeds the config's `maxTokenBudget`
- The breaker fires during execution phase
- The result has `status: 'halted'` or the appropriate error type
- Verify the result includes the budget/spend numbers

This is the test that the file promises but never delivers.

- [ ] **Step 3: Add mid-execution injection test to injection-midflow.test.ts**

Write a test where:
- Ingestion passes cleanly
- Planning succeeds
- During execution, a skill result contains injection patterns (e.g., "ignore previous instructions" in the tool output)
- Verify the execution phase detects and handles this (either blocks the result or flags it)

If the current implementation does NOT check for injection mid-flow, document this as a known gap with a `.todo` test.

- [ ] **Step 4: Run tests, commit**

```bash
npx turbo run test --filter=franken-orchestrator
git add -u
git commit -m "test(orchestrator): add real budget-exceeded abort and mid-flow injection e2e tests

budget-exceeded.test.ts now actually tests the exceeded path.
injection-midflow.test.ts tests injection detection during execution."
```

- [ ] **Step 5: Trim e2e-beast-loop.test.ts duplicated sections**

Read `tests/integration/e2e-beast-loop.test.ts`. Remove the 2 tests that duplicate phase-specific test files:
- The "plan phase" test that just does `PlanGraph.empty().addTask().addTask()` + size check (already in phase2-planning)
- The memory push test that just pushes a turn and checks length (already in phase1-ingestion)

```bash
npx vitest run --config vitest.config.ts
git add -u
git commit -m "test: trim duplicated plan/memory tests from e2e-beast-loop"
```

---

### Chunk 14: Fill Concurrency and Boundary Gaps

**Goal:** Add the missing boundary and concurrency tests that would catch real production bugs.

**Files to modify:**
- `packages/frankenfirewall/src/adapters/base-adapter.test.ts`
- `packages/franken-brain/tests/unit/pii/pii-guarded-stores.test.ts` (if not done in Chunk 07)
- `packages/franken-critique/tests/unit/loop/critique-loop.test.ts`
- `packages/franken-brain/tests/unit/compression/truncation-strategy.test.ts`

- [ ] **Step 1: Add retry backoff timing test to base-adapter**

Read `packages/frankenfirewall/src/adapters/base-adapter.ts` to understand the retry logic.

Write a test with `initialDelayMs: 100` and `backoffMultiplier: 2`. Use `vi.useFakeTimers()`. Verify:
- First retry waits ~100ms
- Second retry waits ~200ms
- Third retry waits ~400ms

This is the ONLY way to verify the backoff multiplier logic, which is currently untested because every existing test uses `initialDelayMs: 0`.

- [ ] **Step 2: Add async breaker test to critique-loop**

Read the CritiqueLoop source. Write a test where a breaker's `checkAsync()` method is used (like TokenBudgetBreaker). Verify the loop awaits it and respects the trip signal.

- [ ] **Step 3: Add FIFO verification to truncation-strategy**

Write a test with 3 turns of DIFFERENT token counts (e.g., 10, 20, 30). Set budget to allow only one turn. Verify the oldest (first) turn is dropped first, not the largest or the newest.

- [ ] **Step 4: Run tests, commit**

```bash
npx turbo run test --filter=frankenfirewall --filter=franken-critique --filter=franken-brain
git add -u
git commit -m "test: add retry backoff timing, async breaker, and FIFO truncation tests

These fill three critical gaps identified in the audit:
- BaseAdapter backoff multiplier was untested (all tests used delay=0)
- CritiqueLoop async checkAsync path was never exercised
- TruncationStrategy FIFO ordering was untested (identical token counts)"
```

---

### Deferred Gaps (not addressed in this plan)

The audit identified 14 critical untested paths. This plan addresses 9. The following 5 are deferred to a future plan:

1. **Discord timestamp replay protection** — the implementation itself is missing this feature, not just the test. Requires a design decision.
2. **HeartbeatPortAdapter.pulse() error propagation e2e** — needs a test factory change to inject a failing heartbeat port.
3. **Concurrent write tests** for episodic/working/semantic stores — requires careful test design with real SQLite/Chroma concurrency.
4. **Multi-block adapter responses** (text + tool_use simultaneously) — needs fixture data from real Claude/OpenAI responses.
5. **ParallelPlanner concurrency proof** — proving true parallelism (not just serial `for...of await`) requires timing-based assertions that can be flaky.

---

## Phase 3: Prevention

### Chunk 15: CI Lint Gate for Fluff Prevention

**Goal:** Add a grep-based CI check that fails on common fluff patterns, preventing recurrence.

**Files to create:**
- `scripts/lint-tests.sh`

**Files to modify:**
- `.github/workflows/ci.yml` (add lint step)

- [ ] **Step 1: Write `scripts/lint-tests.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ERRORS=0

echo "=== Test Suite Lint ==="

# Disease 1: expectTypeOf in test files
COUNT=$(grep -r "expectTypeOf" --include="*.test.ts" -l | wc -l)
if [ "$COUNT" -gt 0 ]; then
  echo "FAIL: $COUNT test files use expectTypeOf (use tsc --noEmit instead)"
  grep -r "expectTypeOf" --include="*.test.ts" -l
  ERRORS=$((ERRORS + 1))
fi

# Disease 2: Testing that 1+1=2
if grep -r "1 + 1" --include="*.test.ts" -q 2>/dev/null; then
  echo "FAIL: Found arithmetic smoke tests (1 + 1 === 2)"
  grep -r "1 + 1" --include="*.test.ts" -l
  ERRORS=$((ERRORS + 1))
fi

# Disease 3: readFileSync + toContain in test files (doc content testing)
COUNT=$(grep -r "readFileSync" --include="*.test.ts" -l | \
  xargs grep -l "toContain\|toMatch" 2>/dev/null | \
  grep -v "release-please\|tsconfig\|workspaces\|turborepo\|verify-everything" | wc -l)
if [ "$COUNT" -gt 0 ]; then
  echo "FAIL: $COUNT test files grep documentation content (use a linter instead)"
  ERRORS=$((ERRORS + 1))
fi

# Disease 4: typeof === 'function' as sole assertion
COUNT=$(grep -r "toBeTypeOf('function')" --include="*.test.ts" -l | wc -l)
if [ "$COUNT" -gt 0 ]; then
  echo "WARN: $COUNT test files check typeof === 'function' (TypeScript already guarantees this)"
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Test lint failed with $ERRORS error(s)."
  echo "See: docs/test-suite-audit-2026-03-17.md for context."
  exit 1
fi

echo "Test lint passed."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/lint-tests.sh
```

- [ ] **Step 3: Add to CI workflow**

Add a step in `.github/workflows/ci.yml` after the test step:

```yaml
- name: Lint test suite for fluff patterns
  run: ./scripts/lint-tests.sh
```

- [ ] **Step 4: Run locally to verify**

```bash
./scripts/lint-tests.sh
```

Expected: PASS (after Phase 1 deletions).

- [ ] **Step 5: Commit**

```bash
git add scripts/lint-tests.sh .github/workflows/ci.yml
git commit -m "ci: add test suite lint gate to prevent fluff recurrence

Blocks: expectTypeOf in tests, arithmetic smoke tests, doc content
greps as tests, and warns on typeof === 'function' assertions.

Ref: docs/test-suite-audit-2026-03-17.md"
```

---

## Verification Checklist

After all chunks complete:

- [ ] `npm test` passes across all packages
- [ ] `npm run typecheck` passes (deleting test files shouldn't break types)
- [ ] `./scripts/lint-tests.sh` passes
- [ ] Test count is ~2,200-2,300 (down from ~2,541)
- [ ] No test file contains `expectTypeOf`
- [ ] No test file contains `1 + 1`
- [ ] `budget-exceeded.test.ts` actually tests the exceeded path
- [ ] `injection-midflow.test.ts` tests mid-execution injection
- [ ] Slack signature middleware uses `timingSafeEqual`
- [ ] Update `docs/PROGRESS.md` with new test counts
- [ ] Update `docs/RAMP_UP.md` test count reference
