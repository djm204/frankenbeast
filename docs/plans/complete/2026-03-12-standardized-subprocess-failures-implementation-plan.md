# Standardized Subprocess Failures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize subprocess failure handling so provider fallback correctly detects stdout-based rate limits and orchestrator command failures become easy to track and observe.

**Architecture:** Introduce a shared subprocess failure classifier and canonical failure shape, then adopt it first in the LLM execution paths and the highest-value git/PR helpers. Keep human-readable terminal output, but render it from the standardized failure object so logs and recovery logic consume one contract.

**Tech Stack:** TypeScript, Vitest, Node.js child-process utilities, workspace package `franken-orchestrator`

---

### Task 1: Lock the Provider Fallback Regression With Failing Tests

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/skills/rate-limit-resilience.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- `MartinLoop` falls back when Claude emits rate-limit output only on `stdout`
- `CliLlmAdapter` treats stdout-only provider rate limits as retryable fallback events

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/skills/rate-limit-resilience.test.ts tests/unit/adapters/cli-llm-adapter.test.ts`
Expected: FAIL because rate-limit classification currently checks `stderr` only at the decision point.

**Step 3: Write minimal implementation**

- introduce shared normalization of provider subprocess output
- switch fallback classification to the standardized failure object

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/skills/rate-limit-resilience.test.ts tests/unit/adapters/cli-llm-adapter.test.ts`
Expected: PASS

### Task 2: Add the Shared Subprocess Failure Contract

**Files:**
- Create: `packages/franken-orchestrator/src/errors/command-failure.ts`
- Modify: `packages/franken-orchestrator/src/skills/martin-loop.ts`
- Modify: `packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- Test: `packages/franken-orchestrator/tests/unit/errors/command-failure.test.ts`

**Step 1: Write the failing tests**

Add classifier tests for:
- stdout-only rate limits
- stderr-only rate limits
- generic non-zero exits
- timeouts
- spawn failures

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/errors/command-failure.test.ts`
Expected: FAIL because the shared classifier does not exist yet.

**Step 3: Write minimal implementation**

- define the canonical `CommandFailure` shape
- add the shared classifier and normalized text builder
- thread provider-specific rate-limit and retry-after hooks through the classifier

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/errors/command-failure.test.ts`
Expected: PASS

### Task 3: Standardize Git and PR Helper Failures

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/base-branch.ts`
- Modify: `packages/franken-orchestrator/src/skills/git-branch-isolator.ts`
- Modify: `packages/franken-orchestrator/src/closure/pr-creator.ts`
- Modify: `packages/franken-orchestrator/tests/unit/skills/git-branch-isolator.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/base-branch.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/closure/pr-creator.test.ts`

**Step 1: Write the failing tests**

Add tests proving subprocess failures in these helpers now expose the canonical failure fields rather than only free-form strings.

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/skills/git-branch-isolator.test.ts tests/unit/cli/base-branch.test.ts tests/unit/closure/pr-creator.test.ts`
Expected: FAIL because these helpers currently stringify subprocess failures ad hoc.

**Step 3: Write minimal implementation**

- classify git and `gh` command failures with the shared helper
- preserve existing success behavior and operator-facing messaging

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/skills/git-branch-isolator.test.ts tests/unit/cli/base-branch.test.ts tests/unit/closure/pr-creator.test.ts`
Expected: PASS

### Task 4: Keep Logging Compatible While Capturing Standardized Failures

**Files:**
- Modify: `packages/franken-orchestrator/src/logging/beast-logger.ts`
- Modify: `packages/franken-orchestrator/src/logger.ts` (only if needed for parity)
- Test: `packages/franken-orchestrator/tests/unit/logging/beast-logger.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- terminal rendering still shows readable error lines
- captured log payloads include the standardized failure fields

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- tests/unit/logging/beast-logger.test.ts`
Expected: FAIL because the logger does not yet render/capture the new failure shape consistently.

**Step 3: Write minimal implementation**

- keep terminal output concise
- capture canonical failure data in the file log path

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- tests/unit/logging/beast-logger.test.ts`
Expected: PASS

### Task 5: Run Verification and Update Decision Docs

**Files:**
- Modify: `docs/plans/2026-03-12-standardized-subprocess-failures-design.md`
- Modify: `docs/adr/021-standardized-subprocess-failure-contract.md`
- Modify: `docs/plans/2026-03-12-standardized-subprocess-failures-implementation-plan.md`

**Step 1: Run focused verification**

Run: `npm --workspace franken-orchestrator test -- tests/unit/errors/command-failure.test.ts tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/rate-limit-resilience.test.ts tests/unit/skills/git-branch-isolator.test.ts tests/unit/cli/base-branch.test.ts tests/unit/closure/pr-creator.test.ts tests/unit/logging/beast-logger.test.ts`
Expected: PASS

**Step 2: Run broader orchestrator verification**

Run: `npm --workspace franken-orchestrator run typecheck`
Expected: PASS

**Step 3: Record any design drift**

If implementation forced a material change, update the design doc and ADR before claiming completion.
