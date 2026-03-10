---
isImplementationPlan: true
planId: "2026-03-10-work-command"
status: "draft"
source: "local"
priority: "high"
score: 0
maxScore: 100
---

# Work Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class `frankenbeast work` lifecycle that discovers implementation plans via frontmatter, falls back to prioritized GitHub issues, iterates plan improvement/review up to 5 times, and executes accepted work in isolated git worktrees on feature branches.

**Architecture:** Add a `src/work/` orchestration layer in `franken-orchestrator` for frontmatter parsing, plan discovery, issue sourcing, review/improvement loops, worktree execution, and persisted work state. Extend the CLI to support `work`, `work issues`, and `plan prepare`, and update plan/chunk writers plus docs so manually-authored and generated plans follow one canonical artifact contract.

**Tech Stack:** TypeScript (ESM, strict), Node.js filesystem and child process APIs, Vitest, existing `franken-orchestrator` CLI/session/checkpoint plumbing, existing issue fetch/triage modules

**Design Doc:** `docs/plans/2026-03-10-work-command-design.md`

---

### Task 1: Refactor CLI parsing for `work`, `work issues`, and `plan prepare`

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`

**Step 1: Write the failing CLI tests**

Add coverage for:

```ts
expect(parseArgs(['work']).subcommand).toBe('work');
expect(parseArgs(['work', 'issues']).workSource).toBe('issues');
expect(parseArgs(['plan', 'prepare', './docs/plans']).planAction).toBe('prepare');
expect(parseArgs(['issues']).subcommand).toBe('issues');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts`
Expected: FAIL because `args.ts` does not support nested `work issues` or `plan prepare`

**Step 3: Extend the CLI argument model**

Update `args.ts` so it can parse:

- `subcommand: 'work' | 'plan' | 'run' | 'issues' | 'interview' | 'chat' | 'chat-server'`
- `workSource?: 'issues'`
- `planAction?: 'prepare'`
- `planTargets?: string[]`

Recommended shape:

```ts
export interface CliArgs {
  subcommand: Subcommand;
  workSource?: 'issues';
  planAction?: 'prepare';
  planTargets?: string[];
  // existing fields...
}
```

Refactor the usage text so the new commands appear in examples and help output.

**Step 4: Wire command routing in `run.ts`**

Add dispatch branches so:

- `frankenbeast work` enters the new work coordinator path
- `frankenbeast work issues` forces issue-sourced work
- `frankenbeast issues` aliases to the same path as `work issues`
- `frankenbeast plan prepare` runs the frontmatter-preparation path and exits

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/tests/unit/cli/args.test.ts \
  packages/franken-orchestrator/tests/unit/cli/run.test.ts
git commit -m "feat(orchestrator): add work and plan prepare cli routing"
```

### Task 2: Add shared frontmatter parsing, serialization, and preparation utilities

**Files:**
- Create: `packages/franken-orchestrator/src/work/frontmatter.ts`
- Create: `packages/franken-orchestrator/src/work/plan-prepare.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/frontmatter.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/plan-prepare.test.ts`
- Modify: `packages/franken-orchestrator/src/index.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`

**Step 1: Write failing tests for frontmatter merge behavior**

Cover:

- creating plan frontmatter when none exists
- merging required plan keys into existing frontmatter
- preserving unrelated frontmatter fields
- adding chunk keys without converting a chunk into a parent plan
- skipping ambiguous chunk files with no safe `implementationPlan`

Representative assertion:

```ts
expect(result.frontmatter.isImplementationPlan).toBe(true);
expect(result.frontmatter.owner).toBe('docs-team');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/frontmatter.test.ts tests/unit/work/plan-prepare.test.ts`
Expected: FAIL because the new work utilities do not exist

**Step 3: Implement `frontmatter.ts`**

Add a lightweight parser/serializer that:

- detects YAML-style frontmatter bounded by `---`
- parses key/value pairs needed by the work pipeline
- preserves body content
- merges missing required keys without dropping unknown keys

Keep the scope narrow and deterministic. Do not add a Markdown dependency just for this.

**Step 4: Implement `plan-prepare.ts`**

Add path-based utilities that:

- accept one or more files/directories
- walk Markdown files recursively
- infer parent-plan preparation by default
- support explicit chunk preparation when metadata is supplied
- report skipped files when chunk lineage is ambiguous

**Step 5: Wire `plan prepare` into `run.ts`**

The command should print a concise per-file summary: updated, unchanged, or skipped.

**Step 6: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/frontmatter.test.ts tests/unit/work/plan-prepare.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/work/frontmatter.ts \
  packages/franken-orchestrator/src/work/plan-prepare.ts \
  packages/franken-orchestrator/src/index.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/tests/unit/work/frontmatter.test.ts \
  packages/franken-orchestrator/tests/unit/work/plan-prepare.test.ts
git commit -m "feat(orchestrator): add plan frontmatter preparation utilities"
```

### Task 3: Implement plan discovery and ranking from Markdown frontmatter

**Files:**
- Create: `packages/franken-orchestrator/src/work/types.ts`
- Create: `packages/franken-orchestrator/src/work/plan-discovery-service.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/plan-discovery-service.test.ts`
- Modify: `packages/franken-orchestrator/src/cli/project-root.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/project-root.test.ts`

**Step 1: Write the failing discovery tests**

Cover:

- detecting only files with `isImplementationPlan: true`
- excluding `isChunk: true` files from top-level selection
- ignoring `.git`, `node_modules`, `.worktrees`, and `.frankenbeast/.build`
- ranking by `priority`, `status`, and modified time

Representative assertions:

```ts
expect(result.plans.map((p) => p.path)).toEqual([criticalPath, highPath]);
expect(result.chunks).toHaveLength(1);
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/plan-discovery-service.test.ts tests/unit/cli/project-root.test.ts`
Expected: FAIL because `PlanDiscoveryService` does not exist and project paths lack work-state locations

**Step 3: Add shared work types**

Create `src/work/types.ts` with the canonical local shapes:

- `PlanPriority`
- `PlanStatus`
- `PlanFrontmatter`
- `ChunkFrontmatter`
- `DiscoveredPlan`
- `DiscoveredChunk`

**Step 4: Implement `PlanDiscoveryService`**

The service should:

- walk Markdown under the project root
- parse frontmatter via `frontmatter.ts`
- collect parent plans and chunks separately
- rank plans with deterministic ordering

**Step 5: Extend project path helpers**

Add conventional work-state paths to `project-root.ts`, for example:

- `.frankenbeast/work/`
- `.frankenbeast/work/state.json`

These will be used by later tasks for persisted review and execution state.

**Step 6: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/plan-discovery-service.test.ts tests/unit/cli/project-root.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/work/types.ts \
  packages/franken-orchestrator/src/work/plan-discovery-service.ts \
  packages/franken-orchestrator/src/cli/project-root.ts \
  packages/franken-orchestrator/tests/unit/work/plan-discovery-service.test.ts \
  packages/franken-orchestrator/tests/unit/cli/project-root.test.ts
git commit -m "feat(orchestrator): discover implementation plans via frontmatter"
```

### Task 4: Stamp planner and chunk outputs with canonical frontmatter

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/file-writer.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-file-writer.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/file-writer.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/chunk-file-writer.test.ts`

**Step 1: Write failing writer tests**

Add assertions that:

- implementation plan output includes `isImplementationPlan: true`
- chunk output includes `isChunk: true`
- chunk output includes `implementationPlan`

Representative assertions:

```ts
expect(contents).toContain('isImplementationPlan: true');
expect(chunkContents).toContain('isChunk: true');
expect(chunkContents).toContain('implementationPlan:');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/file-writer.test.ts tests/unit/chunk-file-writer.test.ts`
Expected: FAIL because the current writers emit plain Markdown bodies with no frontmatter

**Step 3: Update `file-writer.ts`**

Refactor plan-writing helpers so they prepend canonical plan frontmatter before the Markdown body.

At minimum, implementation plan writers should stamp:

```yaml
isImplementationPlan: true
status: draft
source: local
priority: high
score: 0
maxScore: 100
```

**Step 4: Update `chunk-file-writer.ts`**

Require the caller to provide the parent implementation plan path and stamp chunk frontmatter with:

```yaml
isChunk: true
implementationPlan: <parent path>
status: draft
score: 0
maxScore: 100
```

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/cli/file-writer.test.ts tests/unit/chunk-file-writer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/cli/file-writer.ts \
  packages/franken-orchestrator/src/planning/chunk-file-writer.ts \
  packages/franken-orchestrator/tests/unit/cli/file-writer.test.ts \
  packages/franken-orchestrator/tests/unit/chunk-file-writer.test.ts
git commit -m "feat(orchestrator): stamp plans and chunks with frontmatter"
```

### Task 5: Add prioritized issue sourcing and codebase freshness verification

**Files:**
- Create: `packages/franken-orchestrator/src/work/issue-freshness-verifier.ts`
- Create: `packages/franken-orchestrator/src/work/issue-work-source.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/issue-freshness-verifier.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/issue-work-source.test.ts`
- Modify: `packages/franken-orchestrator/src/issues/types.ts`
- Modify: `packages/franken-orchestrator/src/cli/session.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts`

**Step 1: Write failing tests for issue prioritization and verification**

Cover:

- `work issues --label` passes the label filter through unchanged
- `work issues` without `--label` walks `critical -> high -> medium -> low`
- freshness verification rejects already-fixed issues
- issue-sourced work skips issues already represented by an active implementation plan

Representative assertions:

```ts
expect(fetchCalls.map((c) => c.label)).toEqual([['critical'], ['high']]);
expect(result.actionable.map((i) => i.number)).toEqual([42]);
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/issue-work-source.test.ts tests/unit/work/issue-freshness-verifier.test.ts tests/unit/cli/session-issues.test.ts`
Expected: FAIL because prioritized issue sourcing and freshness verification do not exist

**Step 3: Extend issue-domain types as needed**

Add explicit local/result types for:

- actionable vs skipped issues
- skip reasons such as `already_fixed`, `stale`, `duplicate_plan`

Keep the `IssueFetcher` transport contract stable.

**Step 4: Implement `IssueFreshnessVerifier`**

Use deterministic repo checks first:

- search for explicit issue references in completed/superseded plans
- inspect file paths and success criteria in matching plans
- optionally use a narrow LLM pass only when deterministic evidence is inconclusive

**Step 5: Implement `IssueWorkSource`**

Behavior:

- if labels are provided, fetch once with those labels
- if labels are omitted, fetch by priority label buckets in order
- stop once actionable work is found, unless the user explicitly requested broader intake

**Step 6: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/issue-work-source.test.ts tests/unit/work/issue-freshness-verifier.test.ts tests/unit/cli/session-issues.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/work/issue-freshness-verifier.ts \
  packages/franken-orchestrator/src/work/issue-work-source.ts \
  packages/franken-orchestrator/src/issues/types.ts \
  packages/franken-orchestrator/src/cli/session.ts \
  packages/franken-orchestrator/tests/unit/work/issue-freshness-verifier.test.ts \
  packages/franken-orchestrator/tests/unit/work/issue-work-source.test.ts \
  packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts
git commit -m "feat(orchestrator): prioritize and verify issue-sourced work"
```

### Task 6: Implement structured plan review, improvement, and persisted work state

**Files:**
- Create: `packages/franken-orchestrator/src/work/plan-review-orchestrator.ts`
- Create: `packages/franken-orchestrator/src/work/plan-improver.ts`
- Create: `packages/franken-orchestrator/src/work/work-state-store.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/plan-review-orchestrator.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/plan-improver.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/work-state-store.test.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`

**Step 1: Write the failing review-loop tests**

Cover:

- composite score aggregation
- acceptance threshold behavior
- `good enough` behavior at iteration 5
- rejection when iteration 5 still misses `goodEnoughScore`
- persisted state storing findings, iteration count, and reviewer set

Representative assertions:

```ts
expect(result.verdict).toBe('good_enough');
expect(state.iteration).toBe(5);
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/plan-review-orchestrator.test.ts tests/unit/work/plan-improver.test.ts tests/unit/work/work-state-store.test.ts`
Expected: FAIL because the review loop and state store do not exist

**Step 3: Implement `PlanReviewOrchestrator`**

Use a structured rubric with reviewer profiles:

- principal TypeScript engineer
- principal CLI/orchestrator engineer
- staff test/reliability engineer
- security/governance reviewer

The orchestrator should return:

- per-reviewer findings
- per-category scores
- composite score
- verdict

**Step 4: Implement `PlanImprover`**

The improver should accept structured findings and rewrite only the plan sections that need repair. Avoid regenerating the entire file blindly when only one section failed.

**Step 5: Implement `WorkStateStore`**

Persist:

- plan path
- source issue
- iteration count
- scores
- findings
- selected reviewers
- current status

Use JSON on disk under `.frankenbeast/work/` first. Keep the API narrow so it can move later if needed.

**Step 6: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/plan-review-orchestrator.test.ts tests/unit/work/plan-improver.test.ts tests/unit/work/work-state-store.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/franken-orchestrator/src/work/plan-review-orchestrator.ts \
  packages/franken-orchestrator/src/work/plan-improver.ts \
  packages/franken-orchestrator/src/work/work-state-store.ts \
  packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/tests/unit/work/plan-review-orchestrator.test.ts \
  packages/franken-orchestrator/tests/unit/work/plan-improver.test.ts \
  packages/franken-orchestrator/tests/unit/work/work-state-store.test.ts
git commit -m "feat(orchestrator): add bounded plan review and state persistence"
```

### Task 7: Add worktree-based execution management and the `WorkCoordinator`

**Files:**
- Create: `packages/franken-orchestrator/src/work/worktree-execution-manager.ts`
- Create: `packages/franken-orchestrator/src/work/work-coordinator.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/worktree-execution-manager.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/work-coordinator.test.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/src/index.ts`

**Step 1: Write the failing coordinator tests**

Cover:

- `work` prefers local implementation plans over issues
- `work issues` bypasses local discovery
- accepted and `good enough` plans execute
- rejected plans stop before execution
- worktree path and branch name are persisted to state

Representative assertions:

```ts
expect(executeCalls[0]?.planPath).toBe(localPlanPath);
expect(state.worktreePath).toContain('.worktrees/');
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/work-coordinator.test.ts tests/unit/work/worktree-execution-manager.test.ts`
Expected: FAIL because the coordinator and worktree manager do not exist

**Step 3: Implement `WorktreeExecutionManager`**

Responsibilities:

- create or reuse a worktree path under a controlled directory
- create a feature branch name derived from `planId` or issue number
- hand off execution to existing CLI skill / run plumbing inside the worktree
- persist worktree metadata

Prefer explicit git worktree commands instead of mutating the primary working tree.

**Step 4: Implement `WorkCoordinator`**

Flow:

1. discover local plans
2. source issues if needed
3. synthesize plan if needed
4. chunk if needed
5. review
6. improve and re-review up to 5 iterations
7. execute accepted or `good enough` work in a worktree
8. update persisted state

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/work-coordinator.test.ts tests/unit/work/worktree-execution-manager.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/work/worktree-execution-manager.ts \
  packages/franken-orchestrator/src/work/work-coordinator.ts \
  packages/franken-orchestrator/src/cli/run.ts \
  packages/franken-orchestrator/src/cli/dep-factory.ts \
  packages/franken-orchestrator/src/index.ts \
  packages/franken-orchestrator/tests/unit/work/worktree-execution-manager.test.ts \
  packages/franken-orchestrator/tests/unit/work/work-coordinator.test.ts
git commit -m "feat(orchestrator): orchestrate work runs in isolated git worktrees"
```

### Task 8: Add issue-derived plan synthesis and chunk lineage support

**Files:**
- Create: `packages/franken-orchestrator/src/work/plan-synthesis-service.ts`
- Create: `packages/franken-orchestrator/src/work/chunking-service.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/plan-synthesis-service.test.ts`
- Create: `packages/franken-orchestrator/tests/unit/work/chunking-service.test.ts`
- Modify: `packages/franken-orchestrator/src/planning/chunk-file-writer.ts`
- Modify: `packages/franken-orchestrator/src/cli/file-writer.ts`

**Step 1: Write the failing synthesis/chunking tests**

Cover:

- issue-derived plans receive `source: generated-from-issue`
- generated plans carry stable `planId`
- chunked plans write parent lineage into every chunk
- non-chunked plans remain runnable parent plans

Representative assertions:

```ts
expect(plan.frontmatter.source).toBe('generated-from-issue');
expect(chunkFrontmatter.implementationPlan).toBe(planPath);
```

**Step 2: Run the focused tests to verify they fail**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/plan-synthesis-service.test.ts tests/unit/work/chunking-service.test.ts`
Expected: FAIL because issue-derived synthesis and explicit chunking services do not exist

**Step 3: Implement `PlanSynthesisService`**

The service should:

- generate a parent implementation plan file from an issue or user intent
- stamp canonical frontmatter
- record issue number/URL lineage

**Step 4: Implement `ChunkingService`**

The service should decide whether a plan must be chunked, and when chunking occurs, it should pass the parent implementation plan path into the chunk writer so lineage is guaranteed.

**Step 5: Re-run the focused tests**

Run: `npm --workspace franken-orchestrator test -- tests/unit/work/plan-synthesis-service.test.ts tests/unit/work/chunking-service.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/work/plan-synthesis-service.ts \
  packages/franken-orchestrator/src/work/chunking-service.ts \
  packages/franken-orchestrator/src/planning/chunk-file-writer.ts \
  packages/franken-orchestrator/src/cli/file-writer.ts \
  packages/franken-orchestrator/tests/unit/work/plan-synthesis-service.test.ts \
  packages/franken-orchestrator/tests/unit/work/chunking-service.test.ts
git commit -m "feat(orchestrator): synthesize issue plans and preserve chunk lineage"
```

### Task 9: Update user-facing docs for `work`, `work issues`, authoring, and `plan prepare`

**Files:**
- Modify: `README.md`
- Modify: `docs/guides/fix-github-issues.md`
- Modify: `docs/guides/quickstart.md`
- Create: `docs/guides/author-implementation-plans.md`

**Step 1: Write the docs changes**

Update the README command reference to include:

- `frankenbeast work`
- `frankenbeast work issues`
- `frankenbeast plan prepare <paths...>`
- `frankenbeast issues` as a compatibility alias

Update the issue guide so it explains:

- `issues` is now a work source under `work`
- `--label` is optional
- omitted `--label` means `critical -> high -> medium -> low`

Create `author-implementation-plans.md` covering:

- required parent plan frontmatter
- required chunk frontmatter
- how `plan prepare` patches existing Markdown
- how `work` chooses plans

**Step 2: Sanity-check docs for command consistency**

Run: `rg -n "frankenbeast (work|issues|plan prepare)" README.md docs/guides`
Expected: The new command forms appear consistently

**Step 3: Commit**

```bash
git add README.md \
  docs/guides/fix-github-issues.md \
  docs/guides/quickstart.md \
  docs/guides/author-implementation-plans.md
git commit -m "docs: document work command and manual plan authoring"
```

### Task 10: Run end-to-end verification before completion

**Files:**
- Test: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/work/frontmatter.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/work/plan-discovery-service.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/work/issue-work-source.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/work/plan-review-orchestrator.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/work/work-coordinator.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/work/worktree-execution-manager.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/file-writer.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/chunk-file-writer.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/session-issues.test.ts`

**Step 1: Run the focused new work suite**

Run:

```bash
npm --workspace franken-orchestrator test -- \
  tests/unit/cli/args.test.ts \
  tests/unit/work/frontmatter.test.ts \
  tests/unit/work/plan-prepare.test.ts \
  tests/unit/work/plan-discovery-service.test.ts \
  tests/unit/work/issue-freshness-verifier.test.ts \
  tests/unit/work/issue-work-source.test.ts \
  tests/unit/work/plan-review-orchestrator.test.ts \
  tests/unit/work/plan-improver.test.ts \
  tests/unit/work/work-state-store.test.ts \
  tests/unit/work/work-coordinator.test.ts \
  tests/unit/work/worktree-execution-manager.test.ts \
  tests/unit/cli/file-writer.test.ts \
  tests/unit/chunk-file-writer.test.ts \
  tests/unit/cli/session-issues.test.ts
```

Expected: PASS

**Step 2: Run orchestrator typecheck and full package tests**

Run:

```bash
npm --workspace franken-orchestrator run typecheck
npm --workspace franken-orchestrator test
```

Expected: PASS

**Step 3: Run the root verification pass**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS or known unrelated failures documented explicitly before completion

**Step 4: Final commit**

```bash
git add packages/franken-orchestrator README.md docs/guides docs/plans/2026-03-10-work-command-design.md docs/plans/2026-03-10-work-command-implementation-plan.md
git commit -m "feat(orchestrator): add work command lifecycle"
```
