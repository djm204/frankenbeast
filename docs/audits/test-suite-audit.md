# Test Suite Audit: Useless Tests

**Date**: 2026-03-26
**Branch**: `feat/phase8-integration`
**Scope**: All 13 packages + root-level tests (~3,600 tests across ~490 files)

## Executive Summary

| Package | Total Tests | Useless | % Useless | Status |
|---------|------------|---------|-----------|--------|
| franken-orchestrator | ~1,564 | ~40 | 2.6% | Active |
| franken-observer | ~250 | 10 | 4.0% | Active |
| franken-planner | ~200 | 15-18 | 8.0% | Active |
| franken-critique | ~120 | 17 | 14.2% | Active |
| franken-governor | ~100 | 13 | 13.0% | Active |
| root-level | ~80 | 25 | 31.3% | Active |
| franken-types | ~45 | 13 | 28.9% | Active |
| franken-brain | 27 | 3 | 11.1% | Active |
| franken-web | ~38 | 0 | 0% | Active |
| franken-heartbeat | 117 | 35 | 29.9% | DELETED |
| franken-mcp | 71 | 15 | 21.1% | DELETED |
| franken-skills | ~78 | 21 | 26.9% | DELETED |
| frankenfirewall | ~80 | 8 | 10.0% | DELETED |
| franken-comms | 0 | 0 | -- | No tests |
| **TOTAL** | **~2,870** | **~215** | **~7.5%** | |

**Active packages only: ~136 useless tests** to address.

---

## Categories of Uselessness

| Category | Count | Description |
|----------|-------|-------------|
| Tautological / Trivial | ~55 | Tests verifying TypeScript compilation, `expect(x).toBeDefined()` on just-assigned variables, checking hardcoded constants equal themselves |
| Redundant | ~45 | Duplicate tests across unit/integration files, or tests subsumed by more thorough tests in the same file |
| Testing Language/Framework Features | ~30 | Verifying `typeof x === 'function'`, `JSON.parse(JSON.stringify())` round-trips, `ulid()` uniqueness, `crypto.randomUUID()` uniqueness |
| Implementation Mirroring | ~20 | Tests that restate the implementation (e.g., checking a log format string character-for-character) |
| No Meaningful Assertion | ~15 | Tests with `expect(x).toBeDefined()` as the only assertion, or assertions that accept any outcome |
| Dead/Misleading | ~5 | Permanently skipped tests or tests whose assertions don't match their description |

---

## Package-by-Package Findings

### franken-types (13 useless / ~45 total)

All useless tests are in the "type-level" describe blocks. They construct object literals with TypeScript type annotations, then assert the properties equal the values just assigned. `tsc`/`typecheck` already validates this.

| File | Test | Category | Action |
|------|------|----------|--------|
| `tests/brain.test.ts` | `IBrain has required shape` | Tautological | Delete |
| `tests/brain.test.ts` | `IWorkingMemory has required methods` | Tautological | Delete |
| `tests/brain.test.ts` | `IEpisodicMemory has required methods` | Tautological | Delete |
| `tests/brain.test.ts` | `IRecoveryMemory has required methods` | Tautological | Delete |
| `tests/provider.test.ts` | `ProviderType covers all 6 adapter types` | Tautological | Delete |
| `tests/provider.test.ts` | `ProviderAuthMethod covers all methods` | Tautological | Delete |
| `tests/provider.test.ts` | `LlmStreamEvent discriminated union covers all event types` | Tautological | Delete |
| `tests/provider.test.ts` | `LlmContentBlock union covers text, image, and tool_result` | Tautological | Delete |
| `tests/provider.test.ts` | `ILlmProvider has required shape` | Tautological | Delete |
| `tests/provider.test.ts` | `ILlmProvider supports optional discoverSkills` | Tautological | Delete |
| `tests/provider.test.ts` | `CritiqueContext and CritiqueResult have required shape` | Implementation mirroring | Delete |
| `tests/provider.test.ts` | `ProviderSkillConfig has required shape` | Tautological | Delete |
| `tests/provider.test.ts` | `LlmRequest has required shape` / `AuthField has required shape` | Tautological | Delete |

**Action**: Delete the entire "Brain interfaces (type-level)" and "Provider interfaces (type-level)" describe blocks. Keep all Zod schema tests.

---

### franken-brain (3 useless / 27 total)

All 3 useless tests are in `tests/unit/types/ids.test.ts` -- they test the `ulid` library through a 1-line passthrough wrapper `generateId()`.

| File | Test | Category | Action |
|------|------|----------|--------|
| `tests/unit/types/ids.test.ts` | `returns a non-empty string` | Testing 3rd-party library | Delete |
| `tests/unit/types/ids.test.ts` | `generates unique ids` | Testing 3rd-party library | Delete |
| `tests/unit/types/ids.test.ts` | `ids generated later are lexicographically greater` | Testing 3rd-party library | Delete |

**Action**: Delete entire `ids.test.ts` file.

---

### franken-planner (15-18 useless / ~200 total)

| File | Test | Category | Action |
|------|------|----------|--------|
| `unit/hitl/hitl-gate.test.ts` | `receives the markdown string passed to requestApproval` | No meaningful assertion | Delete |
| `unit/planners/parallel.test.ts` | `has name "parallel"` | Tautological | Delete |
| `unit/planners/recursive.test.ts` | `has name "recursive"` | Tautological | Delete |
| `unit/planners/linear.test.ts` | `has name "linear"` | Tautological | Delete |
| `unit/planner.test.ts` | 8 tests duplicated in `planner-linear.integration.test.ts` | Redundant | Delete from one file |
| `unit/cot/cot-gate.test.ts` | `carries the taskId` + `carries the rejection reason` | Redundant (same setup) | Merge into 1 test |
| `unit/cot/rationale-enforcer.test.ts` | `sets reasoning to a non-empty string derived from the task objective` | Implementation mirroring | Weaken assertion |
| `unit/cot/rationale-enforcer.test.ts` | `sets timestamp to a Date instance` | Tautological | Delete |
| `unit/cot/rationale-enforcer.test.ts` | `sets expectedOutcome to a non-empty string` | Tautological | Delete |
| `unit/hitl/plan-exporter.test.ts` | `matches snapshot for a 3-task linear chain` | Implementation mirroring | Delete |

**Biggest win**: Dedup the 8 overlapping tests between `planner.test.ts` and `planner-linear.integration.test.ts`.

---

### franken-observer (10 useless / ~250 total)

The observer suite is remarkably strong. Issues are concentrated in `GrafanaDashboard.test.ts`.

| File | Test | Category | Action |
|------|------|----------|--------|
| `grafana/GrafanaDashboard.test.ts` | `returns a non-null object` | Tautological | Delete |
| `grafana/GrafanaDashboard.test.ts` | `has a schemaVersion field` | Tautological | Delete or assert actual value |
| `grafana/GrafanaDashboard.test.ts` | `has a timezone field` | Tautological | Delete or assert actual value |
| `grafana/GrafanaDashboard.test.ts` | `has a refresh interval` | Tautological | Delete or assert actual value |
| `grafana/GrafanaDashboard.test.ts` | `has a time range with from and to` | Tautological | Delete |
| `grafana/GrafanaDashboard.test.ts` | `output is JSON-serialisable` | Testing language features | Delete |
| `adapters/prometheus/PrometheusAdapter.test.ts` | `returns a non-empty string after a flush` | Redundant | Delete |
| `sampling/TraceSampler.test.ts` | `returns true for any traceId` | Redundant | Delete |
| `export/OTELSerializer.test.ts` | `round-trips: deserialised traceId matches original trace id` | Redundant + language feature | Delete |
| `incident/PostMortemGenerator.test.ts` | `returns a non-empty markdown string` | Redundant | Delete |

---

### franken-critique (17 useless / ~120 total)

11 "implements interface" tests across all evaluator and breaker files, plus 6 issues in `reviewer.test.ts`.

| File | Test | Category | Action |
|------|------|----------|--------|
| `unit/breakers/*.test.ts` (3 files) | `implements CircuitBreaker interface` | Tautological | Delete all 3 |
| `unit/evaluators/*.test.ts` (8 files) | `implements Evaluator interface` | Tautological | Delete all 8 |
| `unit/reviewer.test.ts` | `returns a Reviewer with a review method` | Tautological | Delete |
| `unit/reviewer.test.ts` | `accepts custom knownPackages list` | Tautological | Delete |
| `unit/reviewer.test.ts` | `accepts observability port for token budget breaker` | Tautological | Delete |
| `unit/reviewer.test.ts` | `passes clean code on first iteration` | Redundant with integration | Delete |
| `unit/reviewer.test.ts` | `does not record lessons on single-iteration pass` | Redundant with integration | Delete |
| `unit/reviewer.test.ts` | `halts when token budget exceeded` | No meaningful assertion (accepts 3 possible verdicts) | Fix or delete |

---

### franken-governor (13 useless / ~100 total)

| File | Test | Category | Action |
|------|------|----------|--------|
| `unit/core/config.test.ts` | All 4 tests | Tautological (testing hardcoded constants > 0) | Delete or assert exact values |
| `unit/security/signature-verifier.test.ts` | `sign + verify round-trip succeeds` | Redundant | Delete |
| `unit/security/signature-verifier.test.ts` | `produces deterministic signatures` | Testing language features (HMAC) | Delete |
| `unit/security/session-token.test.ts` | `tokenId is unique per call` | Testing language features (randomUUID) | Delete |
| `unit/security/session-token.test.ts` | `sets grantedBy from params` | Implementation mirroring | Delete |
| `unit/audit/audit-recorder.test.ts` | `sets type to episodic` | Implementation mirroring | Delete |
| `unit/audit/audit-recorder.test.ts` | `sets toolName to hitl-gateway` | Implementation mirroring | Delete |
| `unit/gateway/approval-gateway.test.ts` | `calls auditRecorder.record after receiving response` | Redundant | Delete |
| `unit/gateway/governor-critique-adapter.test.ts` | 2 tests redundant with integration | Redundant | Delete |

---

### franken-orchestrator (~40 useless / ~1,564 total)

The largest package has the lowest uselessness rate (2.6%). Issues cluster in specific patterns:

**Duplicate test/ vs tests/ directories** (3 files, ~400 lines):
| File | Action |
|------|--------|
| `test/adapters/cli-observer-bridge.test.ts` | Delete (superset in `tests/unit/`) |
| `test/cli/budget-enforcement.test.ts` | Delete (covered in `tests/unit/`) |
| `test/cli/cleanup.test.ts` | Merge then delete duplicate |

**Tautological type tests** (3 files):
| File | Tests | Action |
|------|-------|--------|
| `tests/unit/beasts/types.test.ts` | All ~10 tests | Delete entire file |
| `tests/unit/skills/cli-types.test.ts` | Most tests | Delete (keep SkillDescriptor.executionType) |
| `tests/unit/chat/types.test.ts` | 4 discriminated union tests | Delete the narrowing tests |

**Interface conformance typeof checks** (~12 tests scattered across 8 files):
| File | Test pattern | Action |
|------|-------------|--------|
| `unit/adapters/cli-llm-adapter.test.ts` | `implements IAdapter interface` + 4 constructor `toBeDefined` | Delete 5 tests |
| `unit/logging/beast-logger.test.ts` | `satisfies ILogger with 4 methods` | Delete 2 tests |
| `unit/adapters/cli-observer-bridge.test.ts` | `IObserverModule conformance` + 2 property checks | Delete 3 tests |
| `unit/adapters/stream-progress.test.ts` | `returns an object with onLine and stop` | Delete |
| `unit/issues/issue-fetcher.test.ts` | `satisfies the IIssueFetcher interface` | Delete |
| `unit/issues/issue-triage.test.ts` | `satisfies the IIssueTriage interface` | Delete |
| `unit/beasts/services/beast-run-service-notify.test.ts` | `exposes notifyRunStatusChange` | Delete |
| `unit/cli/run.test.ts` | `all building blocks are correctly imported` + `returns object with ask and display` | Delete 2 tests |

**Dead/misleading test**:
| File | Test | Issue |
|------|------|-------|
| `unit/beast-loop.test.ts` | `returns failed result on error` | Asserts `'completed'` not `'failed'` -- does not test what it describes |

---

### Root-Level Tests (25 useless / ~80 total)

The root-level suite has the highest uselessness rate (31.3%).

**Trivial existence/guard checks** (6 tests):
| File | Tests | Action |
|------|-------|--------|
| `tsconfig-paths.test.ts` | `has paths defined`, `has include array` | Delete (subsequent tests cover) |
| `turborepo.test.ts` | `exists at project root`, `turbo is in root devDependencies` | Delete |
| `ci-workflow.test.ts` | `ci.yml file exists`, `release-please.yml exists` | Delete |

**Tautological git history tests** (4 tests):
| File | Tests | Action |
|------|-------|--------|
| `verify-everything.test.ts` | All 4 git history/blame tests | Delete (commit counts only go up) |

**Brittle hard-coded values** (2 tests):
| File | Tests | Action |
|------|-------|--------|
| `verify-everything.test.ts` | `turbo run build succeeds for all 8 packages` | Fix: don't hard-code count |
| `verify-everything.test.ts` | `total test count is at least 1572` | Delete (CI already runs all tests) |

**Redundant with package-level tests** (6 tests):
| File | Tests | Action |
|------|-------|--------|
| `integration/phase2-planning.test.ts` | 3 DAG construction tests | Delete (covered in franken-planner) |
| `integration/phase3-execution.test.ts` | 3 governor tests (signatures, tokens, triggers) | Delete (covered in franken-governor) |

**Misleading/redundant CI checks** (4 tests):
| File | Tests | Action |
|------|-------|--------|
| `ci-workflow.test.ts` | `is valid YAML`, `has a workflow name` | Delete or fix (doesn't actually parse YAML) |
| `release-please-config.test.ts` | `config JSON is valid`, 2 "at least N entries" | Delete (subsumed by individual checks) |

**Trivial toBeDefined-only checks** (2 tests):
| File | Tests | Action |
|------|-------|--------|
| `turborepo.test.ts` | `defines test:ci task`, `defines typecheck task` | Enhance or delete |

---

### franken-web (0 useless / ~38 total)

Clean bill of health. Every test exercises real behavior with meaningful assertions.

---

## Deleted Packages (Historical Record)

These packages were removed in commit `1ee949d` (architecture consolidation). Findings documented for reference only.

### franken-heartbeat (35 useless / 117 total -- DELETED)
- `errors.test.ts`: All 9 tests -- testing JS inheritance and property assignment
- `types.test.ts`: 4 tests -- testing TypeScript discriminated union narrowing
- `cli/run.test.ts`: 7 tests -- testing hardcoded stub return values
- `reflection-engine.test.ts`: Entire file (6 tests) -- redundant with `llm-agnostic.test.ts`
- `response-parser.test.ts`: Entire file (4 tests) -- redundant with `llm-agnostic.test.ts`
- `prompt-builder.test.ts`: 3 tests -- redundant with `llm-agnostic.test.ts`
- `smoke.test.ts`: 2 tests -- `expect(1+1).toBe(2)` (already deleted in prior audit)

### franken-mcp (15 useless / 71 total -- DELETED)
- `mcp-types.test.ts`: All 11 tests -- pure `expectTypeOf` (already deleted in prior audit)
- `json-rpc.test.ts`: 3 tests -- implementation mirroring + redundant roundtrips
- `resolve-constraints.test.ts`: 1 test -- testing JS object spread creates new reference

### franken-skills (21 useless / ~78 total -- DELETED)
- `unified-skill-contract.test.ts`: 8 tests -- pure `expectTypeOf` (already deleted)
- `i-skill-registry.test.ts`: 6 tests -- pure `expectTypeOf` (already deleted)
- `skill-registry.perf.test.ts`: All 3 tests -- testing V8 Map/Array performance
- `skill-gen-scaffold.test.ts`: 1 test -- no meaningful assertion
- `skill-registry.test.ts`: 1 test -- over-testing boolean getter
- `create-registry.test.ts`: 2 tests -- implementation mirroring on debug log format

### frankenfirewall (8 useless / ~80 total -- DELETED)
- 4 type-test files (already deleted in prior audit)
- 4 individual tests: 1 `toBeDefined`-only, 2 `typeof === 'boolean'`, 1 redundant cross-adapter test

---

## Systemic Patterns & Recommendations

### 1. Ban "implements interface" tests
Every package has tests checking `typeof x.method === 'function'`. TypeScript already enforces interface conformance at compile time. **Rule: If a class `implements` an interface, do not write runtime checks for method existence.**

### 2. Ban "type-level" describe blocks
`franken-types`, `frankenfirewall`, `franken-skills`, and `franken-mcp` all had describe blocks titled "type-level" or "type shape" that only used `expectTypeOf` or constructed typed objects and read them back. **Rule: Do not write tests whose only assertions would be caught by `tsc`. Run `npm run typecheck` instead.**

### 3. Don't test 3rd-party library guarantees
`ulid()` uniqueness, `crypto.randomUUID()` uniqueness, `HMAC-SHA256` determinism, `JSON.parse(JSON.stringify())` round-trips on plain objects -- these are all documented guarantees of the libraries/runtime. **Rule: Only test your code's logic, not the behavior of well-tested dependencies.**

### 4. Deduplicate test/ vs tests/ in franken-orchestrator
The `test/` directory is a legacy location with ~10 files, several of which duplicate files in `tests/`. **Action: Merge any unique tests into `tests/`, then delete `test/`.**

### 5. Root-level integration tests should add cross-module value
Several root-level "integration" tests only exercise a single module's API in isolation. If the test doesn't wire multiple packages together, it belongs in the package. **Rule: Root integration tests must exercise cross-package interactions.**

### 6. Guard assertions are noise
`expect(x).toBeDefined()` before a series of property assertions on `x` is redundant -- if `x` were undefined, the property assertions would already fail with a clear error. **Rule: Don't write "guard" assertions that are subsumed by subsequent, more specific assertions.**

### 7. Fix the ratchet tests
`verify-everything.test.ts` has hard-coded package counts (8) and test counts (1572) that require manual updates. Either automate the count derivation or replace with negative assertions (`not.toContain('failed')`).
