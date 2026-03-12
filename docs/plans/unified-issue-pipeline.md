# Implementation Plan - Unified Issue Pipeline & Context Optimization

The current `frankenbeast issues` flow is a "thin slice" that bypasses robust planning, leading to context bloating, infinite loops on missing promise tags, and a lack of local persistence. This plan unifies issues with the standard `PlanGraph` -> `Chunk File` -> `BeastLoop` pipeline.

## Phase 1: Context Optimization (MartinLoop)

Refactor how `MartinLoop` and its renderer handle history to prevent the "Echo Chamber" effect and token exhaustion.

- [ ] **Update `ChunkSessionRenderer`**:
    - Modify `render()` to prune the transcript. 
    - Keep: `objective` + `compaction_summary` + ONLY the last 2-3 assistant/user turns.
    - This stops the linear growth of the prompt.
- [ ] **Strengthen Promise Instructions**:
    - Update `NO_COMMIT_CONSTRAINT` in `martin-loop.ts` to explicitly demand `<promise>TAG</promise>` wrapping.
    - Update `ChunkSessionRenderer` to show the expected wrapped format in the prompt.
- [ ] **Aggressive Compaction**:
    - Update `ChunkSessionCompactor` to be more destructive to old transcript entries once a summary is generated.

## Phase 2: Unified Issue Pipeline (Session & IssueRunner)

Bridge the gap between `issues` triage and the standard `BeastLoop` execution.

- [ ] **Refactor `IssueRunner` / `Session.runIssues`**:
    - Instead of calling `executor.execute` directly, take the `PlanGraph` from `IssueGraphBuilder`.
    - Use `ChunkFileWriter` to write these tasks to a dedicated plan directory: `.frankenbeast/plans/issue-<number>/`.
- [ ] **Standardize Execution**:
    - Dispatch the newly created plan directory to `BeastLoop.run()`.
    - This automatically enables:
        - Multi-task dependency chains (impl -> harden).
        - Proper checkpointing per task.
        - The same robust execution logic used for regular features.

## Phase 3: Validation & Safety

- [ ] **Stale Mate Hardening**:
    - Reduce `maxIterations` for one-shot tasks from 1000 to 50.
    - Ensure `staleMateLimit` is always active to catch usage-limit errors or repetitive output earlier.
- [ ] **Regression Test**:
    - Create a test case in `franken-orchestrator` that simulates a missing `<promise>` tag and verifies the renderer prunes the transcript.

## Verification Plan

1. **Dry Run**: Run `frankenbeast issues --dry-run` to verify it correctly triages and "proposes" a plan.
2. **Local Issue Test**: Run `frankenbeast issues --repo <this-repo> --limit 1` on a known low-severity issue.
3. **Log Audit**: Inspect `.frankenbeast/.build/issues/issue-<num>/issue-<num>-build.log` to confirm the prompt size stays stable across iterations.
