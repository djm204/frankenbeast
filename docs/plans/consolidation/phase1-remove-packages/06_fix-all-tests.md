# Chunk 1.6: Fix All Tests + Critical Test Suite Cleanup + Verify Clean Build

**Phase:** 1 — Remove Dead Packages
**Depends on:** Chunks 1.1–1.5 (all packages deleted)
**Estimated size:** Large (cross-cutting test fixes + test suite audit)

---

## Context

After deleting 5 packages individually, there may be cross-cutting breakage that wasn't caught during individual deletions:
- Tests that import from multiple deleted packages
- Integration tests that wire together components from deleted + retained packages
- TypeScript path mappings that reference deleted packages
- Turbo cache invalidation issues

Additionally, the test suite has accumulated ~1,400+ low-value test assertions that test the test framework, the TypeScript compiler, or mock wiring rather than actual behavior. Phase 1 is the right time to clean house — we're already changing test counts, and the consolidation phases that follow will be writing real tests against new components. Starting with a clean baseline means the new test count reflects actual coverage, not noise.

This chunk is the final verification pass **and** the test suite audit.

## What to Do

### 1. Full grep for any remaining references

```bash
# Check all deleted package names
grep -r "@frankenbeast/comms" . --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git
grep -r "@frankenbeast/mcp" . --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git
grep -r "@frankenbeast/skills" . --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git
grep -r "@frankenbeast/heartbeat" . --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git
grep -r "@frankenbeast/firewall" . --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git

# Also check for package directory names in config files
grep -r "franken-comms\|franken-mcp\|franken-skills\|franken-heartbeat\|frankenfirewall" . --include="*.json" --include="*.yaml" --include="*.yml" --exclude-dir=node_modules --exclude-dir=.git
```

Fix any remaining references found.

### 2. Clean install

```bash
rm -rf node_modules packages/*/node_modules
npm install
```

### 3. Full build + typecheck

```bash
npm run build
npm run typecheck
```

Fix any TypeScript errors. Common issues:
- `tsconfig.json` references pointing to deleted packages
- Path mappings in `tsconfig.json` for deleted packages
- Type imports from deleted packages used in retained packages

### 4. Critical test suite audit — delete the fluff

The pre-consolidation suite has 3,616 tests across 405 files. An audit reveals ~1,400+ assertions that provide zero to near-zero value. Delete them systematically, category by category.

#### 4a. Delete type-only tests (~1,293 assertions, 0% value)

**Pattern:** Tests using `expectTypeOf().toHaveProperty()` and similar vitest type-testing utilities to verify that TypeScript interfaces have expected fields. The TypeScript compiler already enforces this at build time — a type mismatch is a compile error, not a test failure.

**How to find them:**
```bash
grep -rn "expectTypeOf" packages/ --include="*.test.ts" --include="*.test.tsx" -l
```

**Known locations:**
- `packages/franken-types/tests/unit/types.test.ts` (lines 45–129) — 40+ assertions verifying interface shapes
- `packages/franken-critique/tests/unit/types/types.test.ts` (lines 35–227) — 193 lines of pure type shape checks
- `packages/franken-skills/src/types/unified-skill-contract.test.ts` (lines 6–56)
- `packages/frankenfirewall/src/adapters/i-adapter.test.ts` (lines 6–27)
- `packages/frankenfirewall/src/types/guardrail-violation.test.ts` (lines 4–42)

**Action:** Delete entire test files or `describe` blocks that contain only `expectTypeOf` assertions. If a file mixes type assertions with behavioral tests, keep the behavioral tests and delete only the type-checking `it()` blocks.

**Exception:** Keep `expectTypeOf` tests that verify **runtime-relevant** type narrowing (e.g., discriminated union guards that affect runtime behavior).

#### 4b. Delete smoke/version export tests (~8 tests, 5% value)

**Pattern:** Tests that verify `1 + 1 === 2`, that a VERSION string is non-empty, or that a package can be imported. These test the test runner and Node.js, not the code.

**Known locations:**
- `packages/franken-brain/tests/unit/smoke.test.ts` — `expect(1 + 1).toBe(2)`
- `packages/franken-heartbeat/tests/unit/smoke.test.ts` — `expect(VERSION).toBeTypeOf('string')`
- `packages/franken-governor/tests/unit/smoke.test.ts` — `expect(VERSION).toBe('0.1.0')`
- `packages/franken-planner/tests/unit/index.test.ts` — `expect(version.length).toBeGreaterThan(0)`

**Action:** Delete these files entirely.

#### 4c. Delete error class instanceof chain tests (~66 assertions, 10% value)

**Pattern:** Tests that create an error instance and verify it is `instanceof` the parent class, has a `.name` property, and has a `.message`. This is testing that JavaScript class inheritance works — it does, and has since ES6.

**Known locations:**
- `packages/franken-critique/tests/unit/errors/errors.test.ts` (lines 10–115) — 40+ assertions across 6 error classes
- `packages/franken-governor/tests/unit/errors/errors.test.ts` (lines 10–95) — 86 lines of instanceof chains
- `packages/franken-heartbeat/tests/unit/core/errors.test.ts` (lines 8–63) — 18 pure instanceof checks

**Action:** Delete entire error test files. If an error class has non-trivial behavior (e.g., custom serialization, error code mapping), keep those specific tests.

**Exception:** Keep tests that verify error **behavior** — e.g., that throwing `InjectionDetectedError` in a middleware chain triggers a specific recovery path. Those test the system, not the class definition.

#### 4d. Refactor or delete pure mock-call verification tests (~197 assertions across ~78 files, 15% value)

**Pattern:** Tests that stub every dependency with `vi.fn().mockResolvedValue()`, call the unit, and only assert `toHaveBeenCalled()` or `toHaveBeenCalledTimes(1)` — without verifying the result, side effects, or what arguments the mock was called with.

These tests verify wiring, not behavior. The consolidation (13 → 8 packages) will change all internal wiring, making these tests actively harmful — they'll break on every refactor and need constant updating despite catching nothing.

**How to find them:**
```bash
grep -rn "toHaveBeenCalled\b" packages/ --include="*.test.ts" -l
```

Then manually inspect: if the test has no `expect(result)` or `toHaveBeenCalledWith()` assertions — just bare `toHaveBeenCalled()` — it's a candidate for deletion.

**Known locations:**
- `packages/franken-heartbeat/tests/unit/reporter/action-dispatcher.test.ts` (lines 25–77) — stubs planner + hitl, only checks call counts
- `packages/franken-critique/tests/unit/reviewer.test.ts` (lines 64–141) — 8 tests with mocked guardrails/memory/observability, only `toHaveBeenCalled()`
- `packages/franken-mcp/src/client/mcp-client.test.ts` (lines 60–79) — `toHaveBeenCalledOnce()` on mocked transport

**Action:** For each file, apply this decision tree:
1. **Test has `toHaveBeenCalledWith(meaningful args)` + result assertion?** → Keep
2. **Test has only `toHaveBeenCalled()` but tests a critical integration point?** → Upgrade: add argument and result assertions
3. **Test has only `toHaveBeenCalled()` and tests internal wiring?** → Delete

**Do NOT bulk-delete** this category. Review each file individually — some mock-call tests are legitimate contract tests. The goal is to remove the ones that only verify "function A calls function B" without caring about what's passed or returned.

#### 4e. Trim redundant Zod validation tests (~20 tests, 25% value)

**Pattern:** Tests that call `ZodSchema.parse()` / `.safeParse()` with valid/invalid inputs and only check success/failure. Zod is a well-tested library — these tests verify that Zod works, not that the application handles validation results correctly.

**Known locations:**
- `packages/franken-brain/tests/unit/types/memory.test.ts` (lines 110–159) — 10 tests for `parseMemoryEntry()` Zod validator

**Action:** Keep 1–2 "happy path" validation tests per critical schema (proves the schema shape is correct). Delete exhaustive invalid-input tests (e.g., "rejects missing field X", "rejects null for field Y" × 8 fields). Zod handles those — we don't need to retest it.

**Exception:** Keep validation tests where the schema has custom refinements, transforms, or `.superRefine()` logic — those are business rules encoded in Zod, and should be tested.

### 5. Full test suite (post-cleanup)

```bash
npm test
```

Track the test count at three checkpoints:
- **Before (pre-consolidation):** 3,616 tests across 405 files
- **After package deletion (before audit):** Document count — expected reduction from deleted package tests
- **After test audit:** Document final count — expected further reduction of ~1,000–1,400 low-value tests

The remaining tests must all pass. The count will be lower, but every surviving test verifies actual behavior.

### 6. Verify package count

```bash
ls -d packages/*/
```

Should list exactly 8 directories:
1. `packages/franken-types/`
2. `packages/franken-brain/`
3. `packages/franken-planner/`
4. `packages/franken-critique/`
5. `packages/franken-governor/`
6. `packages/franken-observer/`
7. `packages/franken-orchestrator/`
8. `packages/franken-web/`

### 7. Verify .gitignore

```bash
git status
```

Ensure no build artifacts, `node_modules`, or other generated files are untracked.

### 8. Update docs (quick pass)

- `docs/RAMP_UP.md` — update package count from 13 to 8, remove references to deleted packages
- `docs/PROGRESS.md` — add entry for Phase 1 completion

## Test Audit Decision Framework

When reviewing any test file, apply this flowchart:

```
Is the test verifying something the compiler already catches?
  → YES: Delete (type-only tests)
  → NO: Continue

Is the test verifying a third-party library works correctly?
  → YES: Delete (Zod validation, class inheritance)
  → NO: Continue

Does the test verify a result, side effect, or state change?
  → YES: Keep
  → NO: Does it at least verify meaningful arguments passed to a collaborator?
    → YES: Keep (contract test)
    → NO: Delete (pure mock-call verification)

Will the test break when internal wiring changes but external behavior stays the same?
  → YES: Delete or refactor to test the contract, not the wiring
  → NO: Keep
```

## Files

- **Delete:** Entire test files that are 100% low-value (smoke tests, pure type tests, pure error instanceof tests)
- **Modify:** Test files with mixed value — remove low-value `describe`/`it` blocks, keep behavioral tests
- **Modify:** Any files still referencing deleted packages (found by grep)
- **Modify:** Root `tsconfig.json` — clean up references
- **Modify:** `docs/RAMP_UP.md` — update package count
- **Modify:** `docs/PROGRESS.md` — add Phase 1 entry

## Exit Criteria

- Exactly 8 packages exist under `packages/`
- Zero references to any of the 5 deleted packages in the codebase (excluding docs/plans that describe the removal)
- `npm install` succeeds with clean lockfile
- `npm run build` succeeds
- `npm run typecheck` has zero errors
- `npm test` passes (all remaining tests green)
- Test count documented at all three checkpoints (pre-consolidation → post-deletion → post-audit)
- Zero `expectTypeOf().toHaveProperty()` tests remain in the codebase
- Zero smoke tests that verify `1 + 1 === 2` or `VERSION.length > 0`
- Zero error tests that only check `instanceof` + `.name` + `.message` without behavioral assertions
- Pure mock-call tests either upgraded to contract tests or deleted
- Zod validation tests trimmed to 1–2 per critical schema (custom refinements excepted)
- `git status` shows no unexpected untracked files
- `docs/RAMP_UP.md` reflects 8 packages
