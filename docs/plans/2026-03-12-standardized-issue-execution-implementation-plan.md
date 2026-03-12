# Standardized Issue Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize `frankenbeast issues` so one-shot issues execute as real orchestrator tasks and chunked issues run through the normal chunk-file pipeline.

**Architecture:** Keep `IssueRunner` as the issue-level orchestrator, but split its execution path by triage complexity. One-shot issues build executable CLI tasks and run `BeastLoop` directly. Chunked issues materialize real chunk files in an issue plan directory, then execute through `ChunkFileGraphBuilder` plus the existing chunk-file `BeastLoop` flow.

**Tech Stack:** TypeScript, Vitest, Node.js fs/path utilities, workspace package `franken-orchestrator`

---

### Task 1: Lock the One-Shot Regression With Failing Tests

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- one-shot issue graphs execute real CLI work instead of passing through zero-skill tasks
- issue PR creation still receives `{ issueNumber }`
- issue outcomes preserve the created PR URL

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- issue-runner.test.ts`
Expected: FAIL because the current `BeastLoop` issue path does not preserve issue-aware PR metadata and the tests assert the missing behavior.

**Step 3: Write minimal implementation**

- make one-shot issue tasks executable
- preserve issue-aware PR creation metadata
- align issue outcome reporting with the created PR

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- issue-runner.test.ts`
Expected: PASS

### Task 2: Lock the Chunked Pipeline Regression With Failing Tests

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- chunked issues write an issue-specific plan directory
- chunked issues run through the normal chunk-file pipeline
- integration execution invokes the expected impl/harden tasks for decomposed chunks

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator run test:integration -- issues-e2e.test.ts`
Expected: FAIL because chunked issues currently do not materialize chunk files or execute the normal chunk-file flow.

**Step 3: Write minimal implementation**

- add issue plan writing support
- wire chunked issue execution to `ChunkFileWriter` + `ChunkFileGraphBuilder`
- keep the issue-specific runtime artifacts isolated under `issue-<number>`

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator run test:integration -- issues-e2e.test.ts`
Expected: PASS

### Task 3: Align Checkpoints and Outcome Reporting

**Files:**
- Modify: `packages/franken-orchestrator/src/issues/issue-runner.ts`
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- completed issue tasks are detected using `${taskId}:done`
- resumed issue runs short-circuit correctly
- per-issue failures still allow subsequent issues to execute

**Step 2: Run test to verify it fails**

Run: `npm --workspace franken-orchestrator test -- issue-runner.test.ts`
Expected: FAIL because the runner still mixes bare task IDs and orchestrator completion keys.

**Step 3: Write minimal implementation**

- change issue completion checks to `${taskId}:done`
- keep checkpoint injection consistent for both one-shot and chunked flows
- ensure issue status and token accounting remain correct

**Step 4: Run test to verify it passes**

Run: `npm --workspace franken-orchestrator test -- issue-runner.test.ts`
Expected: PASS

### Task 4: Restore and Tighten Verification

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`
- Modify: `packages/franken-orchestrator/src/issues/issue-runner.ts`
- Modify: `packages/franken-orchestrator/src/issues/issue-graph-builder.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/src/cli/session.ts`

**Step 1: Run focused unit verification**

Run: `npm --workspace franken-orchestrator test -- issue-runner.test.ts session-issues.test.ts issue-graph-builder.test.ts`
Expected: PASS

**Step 2: Run issue integration verification**

Run: `npm --workspace franken-orchestrator run test:integration -- issues-e2e.test.ts`
Expected: PASS

**Step 3: Run broader orchestrator verification**

Run: `npm --workspace franken-orchestrator test -- chunk-session-renderer.test.ts closure.test.ts pr-creator.test.ts`
Expected: PASS

**Step 4: Document any residual gaps**

If any verification still fails, record the exact command and failure instead of claiming completion.
