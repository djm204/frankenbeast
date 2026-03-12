# ADR-020: Standardized Issue Execution Path

- **Date:** 2026-03-12
- **Status:** Accepted
- **Deciders:** David Mendez

## Context

PR #208 attempted to standardize `frankenbeast issues` around `BeastLoop`, but the resulting implementation still left issue execution in an inconsistent state:

- issue tasks were not executable under the orchestrator contract because they carried no CLI skills
- chunked issues did not actually flow through the normal chunk-file pipeline
- checkpoint completion keys diverged between the issue runner and `runExecution()`
- issue-aware PR metadata was dropped from the standardized path

We needed a design that reduced issue-specific branching while preserving the operational differences between small one-shot fixes and chunked multi-step work.

## Decision

Standardize issue execution by complexity:

1. **One-shot issues** run through `BeastLoop` directly, but only with executable CLI-backed tasks.
2. **Chunked issues** must write real chunk markdown files into an issue-specific plan directory and then run through the normal chunk-file pipeline.

This means:

- `IssueRunner` dispatches between one-shot and chunked execution based on triage complexity
- one-shot graphs are valid orchestrator execution graphs, not passive metadata
- chunked issue decomposition produces the same chunk-file artifacts used elsewhere in the CLI
- completion checkpoints align with orchestrator semantics using `${taskId}:done`
- issue-aware PR behavior remains explicit, including `{ issueNumber }` and `IssueOutcome.prUrl`

## Consequences

### Positive

- Chunked issue execution now reuses the normal chunk-file `BeastLoop` path instead of a bespoke issue-only loop.
- One-shot issues remain fast, but still honor orchestrator execution contracts.
- Checkpoint semantics become consistent across issue and non-issue execution.
- Issue PRs retain auto-close behavior and summary reporting.

### Negative

- `IssueRunner` becomes a dispatcher with two internal execution modes.
- Chunked issue execution now depends on writing plan artifacts to disk before execution.
- Tests must cover both execution branches explicitly.

### Risks

- If one-shot graphs are not kept executable, the direct path can regress back to no-op execution.
- If issue plan directories drift from normal chunk-file conventions, chunked issues will become another special case.
- PR URL extraction still depends on the issue execution path passing structured result data through correctly.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Revert to the old issue-specific `CliSkillExecutor` loop | Smallest patch, low immediate risk | Preserves a bespoke execution path and duplicates orchestrator behavior | Less standardized and fights the direction of the CLI architecture |
| Run all issues directly as `PlanGraph` tasks inside `BeastLoop` | Single execution surface | Chunked issues still bypass chunk files and lose normal chunk-file behavior | Does not actually standardize on the chunk-file pipeline |
| Force even one-shot issues to emit chunk files | Maximum uniformity | Adds disk artifact overhead and complexity to trivial fixes | Not necessary when a valid executable one-shot graph can use the same orchestrator contracts |
