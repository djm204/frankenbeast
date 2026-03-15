# Issue Stage-Scoped Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make issue execution complete cleanly when work is already satisfied, while still running hardening with exact stage tags and clearer promise-tag diagnostics.

**Architecture:** Split chunk-session persistence by task/stage identity so `impl` and `harden` do not share transcript state. Keep exact-tag completion detection in `MartinLoop`, but surface all emitted promise tags in iteration metadata and logs so mismatches are observable.

**Tech Stack:** TypeScript, Vitest, existing `IssueRunner`, `CliSkillExecutor`, `MartinLoop`, and chunk-session storage.

---

### Task 1: Add failing tests for stage-scoped chunk sessions

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/session/chunk-session-store.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/skills/martin-loop.test.ts`

**Step 1: Write the failing test**

- Add a store test that saves `impl` and `harden` sessions for the same plan/chunk and expects both to reload independently.
- Add a MartinLoop/session test that seeds an `impl` session, then runs `harden` and expects the rendered prompt to contain the hardening task and hardening promise tag.

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace @frankenbeast/orchestrator test -- tests/unit/session/chunk-session-store.test.ts tests/unit/skills/martin-loop.test.ts
```

Expected: FAIL because session loading currently collides across stages.

**Step 3: Write minimal implementation**

- Introduce stage-aware session identity in the session store and MartinLoop load/save path.

**Step 4: Run test to verify it passes**

Run the same command and expect PASS.

### Task 2: Add failing tests for promise-tag diagnostics

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/skills/martin-loop.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts`

**Step 1: Write the failing test**

- Add a MartinLoop test where stdout emits the wrong promise tag and assert exact completion stays false while emitted tags are captured in iteration metadata.
- Add a CLI executor test that expects the failure message/log context to mention the emitted mismatched tag.

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace @frankenbeast/orchestrator test -- tests/unit/skills/martin-loop.test.ts tests/unit/skills/cli-skill-executor.test.ts
```

Expected: FAIL because iteration metadata does not yet expose emitted tags and the executor error message does not mention them.

**Step 3: Write minimal implementation**

- Extend iteration results with emitted promise tags.
- Parse all emitted tags in MartinLoop.
- Thread those diagnostics into CLI executor logging/error reporting.

**Step 4: Run test to verify it passes**

Run the same command and expect PASS.

### Task 3: Verify already-satisfied issue flow does not loop

**Files:**
- Modify: `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`

**Step 1: Write the failing test**

- Add an issue execution case where `impl` returns proof-only completion and `harden` also returns proof-only completion with its own stage tag.
- Assert the issue completes successfully without retries/looping.

**Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace @frankenbeast/orchestrator test -- tests/unit/issues/issue-runner.test.ts tests/integration/issues/issues-e2e.test.ts
```

Expected: FAIL if stage-scoped session identity or exact stage tags are not enforced correctly.

**Step 3: Write minimal implementation**

- Adjust any issue-runner or executor wiring needed to keep `impl` and `harden` isolated while preserving existing sequencing.

**Step 4: Run test to verify it passes**

Run the same command and expect PASS.

### Task 4: Run focused and package verification

**Files:**
- Modify: `packages/franken-orchestrator/src/session/chunk-session-store.ts`
- Modify: `packages/franken-orchestrator/src/session/chunk-session.ts`
- Modify: `packages/franken-orchestrator/src/skills/martin-loop.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-types.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`

**Step 1: Run focused verification**

```bash
npm --workspace @frankenbeast/orchestrator test -- tests/unit/session/chunk-session-store.test.ts tests/unit/skills/martin-loop.test.ts tests/unit/skills/cli-skill-executor.test.ts tests/unit/issues/issue-runner.test.ts tests/integration/issues/issues-e2e.test.ts
```

Expected: PASS.

**Step 2: Run package verification**

```bash
npm --workspace @frankenbeast/orchestrator test
```

Expected: PASS.
