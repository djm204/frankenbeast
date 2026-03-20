# Test Suite Audit — 2026-03-17

> Hyper-critical audit of all ~2,541 tests across 13 packages + root integration.
> Goal: identify fluff, padding, and mock-returns-mock tests that inflate count without catching bugs.

## Executive Summary

| Metric | Count | % |
|--------|-------|---|
| Total tests audited | ~2,541 | 100% |
| **Meaningful** (exercises real logic, catches real bugs) | ~1,555 | 61% |
| **Borderline** (some value, overly simple or obvious) | ~413 | 16% |
| **Fluff** (zero signal, delete without loss) | ~584 | 23% |
| **Fluff + Borderline combined** | ~997 | **39%** |

The real confidence number is ~1,555 meaningful tests, not ~2,541.

---

## Per-Package Breakdown

| Package | Tests | Fluff | Borderline | Meaningful | Fluff % |
|---------|-------|-------|------------|------------|---------|
| frankenfirewall | 163 | 20 | 25 | 118 | 12% |
| franken-skills | 75 | 13 | 12 | 50 | 17% |
| franken-brain | 126 | 31 | 26 | 69 | 25% |
| franken-planner | 186 | 31 | 33 | 122 | 17% |
| franken-observer | 352 | 29 | 56 | 267 | 8% |
| franken-critique | 130 | 45 | 15 | 70 | 35% |
| franken-governor | 131 | 41 | 31 | 62 | 31% |
| franken-heartbeat | 116 | 37 | 26 | 53 | 32% |
| franken-types | 20 | 17 | 1 | 2 | 85% |
| franken-mcp | 67 | 18 | 9 | 40 | 27% |
| franken-comms | 43 | 1 | 15 | 27 | 2% |
| orchestrator (core) | 272 | 41 | 62 | 169 | 15% |
| orchestrator (skills/cli/chat/http/beasts) | 583 | 83 | 66 | 434 | 14% |
| root integration | 277 | 177 | 36 | 72 | **64%** |

---

## The 5 Systemic Diseases

### Disease 1: `expectTypeOf` Facade Tests (~120 tests)

Files named `types.test.ts` across nearly every package use `expectTypeOf<T>().toHaveProperty(...)` or `expectTypeOf<T>().toBeString()`. These are compile-time assertions — TypeScript's own compiler validates all of this before any test runner executes. They exercise zero runtime logic and would pass even if every implementation was deleted, as long as the type definitions compile.

**Affected files:**
- `franken-critique/tests/unit/types/types.test.ts` — 22 tests, 100% fluff
- `franken-types/tests/unit/types.test.ts` — 12 tests, 83% fluff
- `franken-types/tests/unit/ids.test.ts` — 8 tests, 88% fluff
- `franken-mcp/src/types/mcp-types.test.ts` — 9 tests, 100% fluff
- `franken-governor/tests/unit/core/types.test.ts` — 6 tests, 100% fluff
- `franken-skills/src/types/unified-skill-contract.test.ts` — 8 tests, 88% fluff
- `franken-skills/src/registry/i-skill-registry.test.ts` — 6 tests, 83% fluff
- `franken-firewall/src/adapters/i-adapter.test.ts` — 4 tests, 100% fluff
- `franken-firewall/src/types/guardrail-violation.test.ts` — 4 tests, 100% fluff
- `franken-firewall/src/types/unified-request.test.ts` — 4 tests, 100% fluff
- `franken-firewall/src/types/unified-response.test.ts` — 5 tests, 100% fluff
- Orchestrator: `issues/types.test.ts` (25), `beasts/types.test.ts` (4), `chat/types.test.ts` (12), `skills/cli-types.test.ts` (12), `http/ws-chat-types.test.ts` (2)

### Disease 2: Error Class Inheritance Tests (~36 tests)

Three packages have `errors.test.ts` files that repeat the pattern:
```
"is an instance of Error"
"is an instance of ParentError"
"has correct name"
```

This tests JavaScript's class inheritance and TypeScript's extends clause. If `ApprovalTimeoutError extends GovernorError extends Error`, instanceof works. The compiler guarantees this. Combined: ~75% fluff across governor (15 tests), heartbeat (9 tests), and critique (12 tests).

### Disease 3: Documentation Content Tests (~116 tests, 100% fluff)

Five root-level files do nothing but `expect(readFileSync(someDoc)).toContain('some keyword')`:

| File | Tests | What It Does |
|------|-------|--------------|
| `docs-pluggable-providers.test.ts` | 25 | Checks ADR-010 contains strings |
| `docs-gap-closure.test.ts` | 29 | Checks RAMP_UP/PROGRESS contain strings |
| `docs-adr.test.ts` | 22 | Checks ADRs have `## Context` headings |
| `docs-issues-content.test.ts` | 22 | Checks ARCHITECTURE has `--label` etc. |
| `docs-monorepo-layout.test.ts` | 18 | Checks docs mention `npm workspaces` |

The code these docs describe could be completely broken and every test passes. These test markdown, not software.

### Disease 4: Post-Migration Filesystem Checks (24 tests, 100% fluff)

`cleanup-old-dirs.test.ts` checks that old pre-monorepo directories (`franken-brain/` at root) don't exist and that `packages/franken-brain/` does exist. The migration is complete. These will never fail again on any machine.

Partially duplicated by `verify-everything.test.ts` which has another 11 identical checks.

### Disease 5: Mock-Setup-Is-The-Test (~80 tests scattered)

Pattern: mock a dependency to return X, call the function, assert the mock was called. If you remove the mock, there's nothing left. The mock IS the test.

**Worst concentrations:**
- `franken-brain/pii-guarded-stores.test.ts` — 4/6 tests are delegation-via-mock
- `franken-brain/episodic-lesson-extractor.test.ts` — 4/8 tests assert the mock returned what it was configured to return
- `franken-heartbeat/reflection/prompt-builder.test.ts` — 4/6 tests check that keywords appear in a prompt string
- `franken-heartbeat/cli/run.test.ts` — 6 tests that test stubs behave like stubs
- `franken-governor/gateway/approval-gateway.test.ts` — 2/8 are pure call-count assertions
- `franken-governor/audit/audit-recorder.test.ts` — 2/11 check mock called once
- Orchestrator: scattered across `hydration.test.ts`, `cli-observer-bridge.test.ts`, context/config files

---

## Files to DELETE Outright (~297 tests, zero coverage loss)

### Type Facade Files (delete entirely)

| File | Tests | Reason |
|------|-------|--------|
| `franken-critique/tests/unit/types/types.test.ts` | 22 | 100% `expectTypeOf` |
| `franken-types/tests/unit/types.test.ts` | 12 | Tautological object construction |
| `franken-types/tests/unit/ids.test.ts` | 8 | Testing one-line type casts |
| `franken-mcp/src/types/mcp-types.test.ts` | 9 | 100% `expectTypeOf` |
| `franken-governor/tests/unit/core/types.test.ts` | 6 | 100% `expectTypeOf` |
| `franken-skills/src/types/unified-skill-contract.test.ts` | 8 | `expectTypeOf` shape checks |
| `franken-skills/src/registry/i-skill-registry.test.ts` | 6 | `expectTypeOf` shape checks |
| `franken-firewall/src/adapters/i-adapter.test.ts` | 4 | `expectTypeOf` |
| `franken-firewall/src/types/guardrail-violation.test.ts` | 4 | `expectTypeOf` |
| `franken-firewall/src/types/unified-request.test.ts` | 4 | `expectTypeOf` |
| `franken-firewall/src/types/unified-response.test.ts` | 5 | `expectTypeOf` |
| `franken-planner/tests/unit/index.test.ts` | 1 | Version string constant |
| Orch `tests/unit/issues/types.test.ts` | 25 | 100% `expectTypeOf` |
| Orch `tests/unit/beasts/types.test.ts` | 4 | 100% `expectTypeOf` |
| Orch `tests/unit/http/ws-chat-types.test.ts` | 2 | Zod parse tests |
| Orch `tests/unit/chat/types.test.ts` | 12 | 58% fluff, rest borderline |
| Orch `tests/unit/skills/cli-types.test.ts` | 12 | 58% fluff, rest borderline |

### Smoke / Constant Tests (delete entirely)

| File | Tests | Reason |
|------|-------|--------|
| `franken-governor/tests/unit/smoke.test.ts` | 1 | `VERSION === '0.1.0'` |
| `franken-heartbeat/tests/unit/smoke.test.ts` | 2 | `1 + 1 === 2` |
| `franken-brain/tests/unit/smoke.test.ts` | 1 | `1 + 1 === 2` |
| `franken-governor/tests/unit/gateway/governor-factory.test.ts` | 2 | `typeof x === 'function'` |

### Documentation / Migration Tests (delete entirely)

| File | Tests | Reason |
|------|-------|--------|
| Root `tests/integration/docs-pluggable-providers.test.ts` | 25 | Doc content grep |
| Root `tests/integration/docs-gap-closure.test.ts` | 29 | Doc content grep |
| Root `tests/integration/docs-adr.test.ts` | 22 | Doc content grep |
| Root `tests/unit/docs/docs-issues-content.test.ts` | 22 | Doc content grep |
| Root `tests/unit/docs/docs-monorepo-layout.test.ts` | 18 | Doc content grep |
| Root `tests/cleanup-old-dirs.test.ts` | 24 | Post-migration checks |
| Root `tests/integration/cross-module-contracts.test.ts` | 17 | 82% TypeScript shape checks |

### Config / Placeholder Tests (delete entirely)

| File | Tests | Reason |
|------|-------|--------|
| `franken-governor/tests/unit/core/config.test.ts` | 4 | Checks numbers > 0 |
| Orch `tests/unit/config/orchestrator-config-providers.test.ts` | 7 | 86% Zod schema validation |
| Orch `tests/unit/cli/dep-factory-module-toggles.test.ts` | 3 | `expect(true).toBe(true)` placeholders |

---

## Files to REWRITE (fluff tests removed, meaningful gaps filled)

| File | Current | Fluff | Action |
|------|---------|-------|--------|
| `franken-brain/pii-guarded-stores.test.ts` | 6 | 4 | Replace delegation mocks with real store tests; add `redact` mode |
| `franken-brain/episodic-lesson-extractor.test.ts` | 8 | 4 | Test prompt construction, empty LLM response, multiple trace formats |
| `franken-brain/types/memory.test.ts` | 8 | 5 | Replace `expectTypeOf` with cross-variant parse tests |
| `franken-heartbeat/reflection/prompt-builder.test.ts` | 6 | 4 | Test actual prompt structure, not keyword presence |
| `franken-heartbeat/reflection/llm-agnostic.test.ts` | 14 | 5 | Delete duplication; move markdown code block test to response-parser |
| `franken-heartbeat/cli/run.test.ts` | 14 | 7 | Delete stub-testing-stubs block |
| `franken-governor/errors/errors.test.ts` | 15 | 12 | Keep name tests, delete instanceof chain, add cause-chaining |
| `franken-heartbeat/core/errors.test.ts` | 9 | 6 | Same treatment |
| `franken-critique/tests/unit/errors/errors.test.ts` | 12 | 9 | Same treatment |
| `franken-observer/grafana/GrafanaDashboard.test.ts` | 24 | 9 | Delete typeof checks, keep metric coverage + datasource tests |
| `franken-critique/tests/unit/reviewer.test.ts` | 9 | 3 | Delete `typeof review === 'function'` tests |
| Orch `tests/unit/context/franken-context.test.ts` | 7 | 4 | Delete getter/setter tests, keep elapsedMs |
| Orch `tests/unit/config/orchestrator-config.test.ts` | 7 | 4 | Delete Zod default checks, add behavioral config tests |
| Orch `tests/unit/adapters/cli-observer-bridge.test.ts` | 17 | 6 | Delete instanceof/typeof checks |
| Root `tests/integration/e2e-beast-loop.test.ts` | 9 | 2 | Remove duplicated plan/memory section |

---

## Critical Untested Paths (gaps to fill)

These are **real bugs waiting to happen** — production code paths with zero test coverage:

### Security

1. **Slack signature middleware uses `!==` instead of `timingSafeEqual`** — timing oracle vulnerability. WhatsApp implementation does it correctly. The tests cannot catch this.
2. **Discord webhook has no timestamp replay protection** — the spec recommends it, the implementation doesn't do it, no test documents the gap.

### Error Propagation

3. **No e2e test for budget-exceeded abort** — `budget-exceeded.test.ts` exists but has zero test for the actual exceeded path. The breaker fires but no scenario drives it to completion.
4. **No e2e test for mid-flow injection** — `injection-midflow.test.ts` only tests ingestion-time. If a skill response contains injection patterns, nothing tests what happens.
5. **Adapter error propagation untested end-to-end** — If `HeartbeatPortAdapter.pulse()` throws, does the Beast Loop degrade gracefully or crash?
6. **`ChatGateway.handleAction()`** — Central routing for approve/reject flow back to the orchestrator. Zero tests. 4 of 5 SSE event types untested.

### Concurrency / Boundaries

7. **No concurrent write tests** anywhere — episodic store, working memory, semantic store all accept concurrent writes in production. None tested.
8. **`BaseAdapter` retry backoff is dead code** from the test suite's perspective — every test uses `initialDelayMs: 0`, making the backoff multiplier completely untested.
9. **PII `redact` mode entirely untested** in `pii-guarded-stores.test.ts` — only `block` mode is exercised.
10. **CritiqueLoop async breaker path** — `checkAsync` (used by TokenBudgetBreaker) is never exercised at the loop level. Only sync breakers are mocked.

### Missing Edge Cases

11. **Multi-block adapter responses** (text + tool_use simultaneously) — Never tested in any adapter (Claude, OpenAI, Ollama).
12. **`TruncationStrategy` FIFO ordering** — Test uses 3 identical-token turns so it can't distinguish oldest-first from any other drop strategy.
13. **`ParallelPlanner` concurrency proof** — No test that proves tasks in the same wave actually run simultaneously (could be serial `for...of` with `await` and pass).
14. **All 4 comms adapter error paths** — Every adapter tests HTTP success only. HTTP failure, API-level errors (`result.ok === false` for Slack), and network errors are completely untested.

---

## Recurring Antipatterns (for prevention)

| Antipattern | How To Detect | Rule |
|-------------|---------------|------|
| `expectTypeOf` in test files | grep for `expectTypeOf` | Ban from unit tests. If you need type safety, that's what `tsc --noEmit` is for. |
| `typeof x === 'function'` assertions | grep for `toBeTypeOf('function')` | If TypeScript compiles, the method exists. Test behavior, not existence. |
| `expect(mock).toHaveBeenCalledOnce()` as sole assertion | Review for tests with no non-mock assertions | Every test must assert something about the SUT's output or state, not just that a mock was called. |
| `smoke.test.ts` with `1 + 1 === 2` | grep for `1 + 1` | Never commit. The test runner itself validates that it runs. |
| Doc content tests (`readFileSync` + `toContain`) | grep for `readFileSync.*toContain` | Move to a CI linter step, not the test suite. |
| Zod schema validation tests | Tests that call `Schema.parse()` with valid data | Zod has its own tests. Test the behavior that uses the parsed config, not that Zod parses. |

---

## Methodology

8 parallel audit agents, each assigned 1-3 packages. Every test file was read in full. Each test categorized as:

- **FLUFF**: Mocks everything and verifies the mock; tests trivial constructors/getters; duplicates TypeScript compiler checks; tests framework/library behavior instead of our code.
- **BORDERLINE**: Some value but overly simple, tests obvious happy paths, or is a near-duplicate of another test.
- **MEANINGFUL**: Exercises real logic, catches real bugs, tests edge cases, error paths, or integration between components.

Agents were instructed to be hyper-critical and not defend any test.
