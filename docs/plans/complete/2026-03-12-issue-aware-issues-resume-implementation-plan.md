# Issue-Aware Issues Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make one-shot `frankenbeast issues` executions issue-aware so they resume from existing Martin state and are not limited by the chunk 10-iteration cap, while keeping decomposed chunk tasks unchanged.

**Architecture:** Reuse MartinLoop's existing session/checkpoint recovery by passing issue-aware runtime identity from `IssueRunner`. Extend CLI dep wiring so issue artifacts are named per issue, and add a bounded stale-mate policy for one-shot issue execution instead of the chunk cap.

**Tech Stack:** TypeScript, Vitest, Node.js filesystem utilities, existing MartinLoop/session/checkpoint infrastructure

---

### Task 1: Add failing issue-runner tests for one-shot issue runtime policy

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Modify: `packages/franken-orchestrator/src/issues/issue-runner.ts`

**Step 1: Write the failing test**

Add tests that assert:
- one-shot issue tasks do not use `maxIterations: 10`
- one-shot issue tasks pass issue-aware Martin identity
- chunked issue tasks still use `maxIterations: 10`

**Step 2: Run test to verify it fails**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts`
Expected: FAIL on the new issue-policy assertions

**Step 3: Write minimal implementation**

Update `IssueRunner` to build Martin config from issue complexity, with different one-shot vs chunked policies.

**Step 4: Run test to verify it passes**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts packages/franken-orchestrator/src/issues/issue-runner.ts
git commit -m "fix: add issue-aware execution policy for one-shot issues"
```

### Task 2: Add failing dep-factory/session tests for issue artifact naming

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`

**Step 1: Write the failing test**

Add tests that assert issue runtime artifacts include `issue-<n>` in checkpoint/log/session naming for the issues path.

**Step 2: Run test to verify it fails**

Run: `npm test --workspace franken-orchestrator -- tests/unit/cli/session-issues.test.ts tests/unit/cli/dep-factory-providers.test.ts`
Expected: FAIL on the new issue artifact assertions

**Step 3: Write minimal implementation**

Add issue-aware artifact helpers in `createCliDeps()` and wire them into the issues path without disturbing non-issues sessions.

**Step 4: Run test to verify it passes**

Run: `npm test --workspace franken-orchestrator -- tests/unit/cli/session-issues.test.ts tests/unit/cli/dep-factory-providers.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts packages/franken-orchestrator/src/cli/dep-factory.ts
git commit -m "fix: name issue runtime artifacts by issue number"
```

### Task 3: Add failing resume tests for one-shot issues

**Files:**
- Modify: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Modify: `packages/franken-orchestrator/src/issues/issue-runner.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`

**Step 1: Write the failing test**

Add tests that assert a rerun of a failed one-shot issue:
- loads issue-scoped Martin state
- consults checkpointed commits
- recovers the unfinished task from the last known good commit instead of starting clean

**Step 2: Run test to verify it fails**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts`
Expected: FAIL on the resume assertions

**Step 3: Write minimal implementation**

Extend issue execution to pass issue-aware resume metadata into the executor and call recovery when unfinished issue tasks have checkpointed commits.

**Step 4: Run test to verify it passes**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts packages/franken-orchestrator/src/issues/issue-runner.ts packages/franken-orchestrator/src/skills/cli-skill-executor.ts
git commit -m "fix: resume one-shot issues from issue-scoped checkpoints"
```

### Task 4: Verify targeted suites and build

**Files:**
- Modify: `packages/franken-orchestrator/src/issues/issue-runner.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-types.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`
- Test: `packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`

**Step 1: Run focused verification**

Run: `npm test --workspace franken-orchestrator -- tests/unit/issues/issue-runner.test.ts tests/unit/cli/session-issues.test.ts tests/unit/cli/dep-factory-providers.test.ts tests/unit/skills/cli-skill-executor.test.ts`
Expected: PASS

**Step 2: Run build**

Run: `npm run build --workspace franken-orchestrator`
Expected: successful build

**Step 3: Review diff**

Run: `git diff --stat`
Expected: only intended files changed

**Step 4: Commit**

```bash
git add packages/franken-orchestrator/src/issues/issue-runner.ts packages/franken-orchestrator/src/cli/dep-factory.ts packages/franken-orchestrator/src/skills/cli-types.ts packages/franken-orchestrator/src/skills/cli-skill-executor.ts packages/franken-orchestrator/tests/unit/issues/issue-runner.test.ts packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts docs/plans/2026-03-12-issue-aware-issues-resume-design.md docs/plans/2026-03-12-issue-aware-issues-resume-implementation-plan.md
git commit -m "fix: make one-shot issues issue-aware and resumable"
```
