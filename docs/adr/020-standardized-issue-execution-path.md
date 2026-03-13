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

## Decision Evolution

The first accepted draft after review kept a split execution model:

- one-shot issues would run directly as executable `BeastLoop` tasks
- chunked issues would materialize chunk files and use the normal chunk-file pipeline

On 2026-03-12, that draft was rejected during implementation review because it still left `issues` with two execution surfaces. The review findings exposed the execution gap, and the follow-up clarification was:

> issues should be only the source of the problem; execution should still follow the original chunk-file running path

This ADR records that final decision, not the discarded intermediate split-path design.

## Decision

Standardize all issue execution on the chunk-file pipeline:

1. **One-shot issues** emit a single issue chunk file.
2. **Chunked issues** emit multiple issue chunk files from decomposition.
3. **Both paths** execute through the normal `ChunkFileGraphBuilder` plus `BeastLoop` flow.

This means:

- `IssueRunner` still dispatches by triage complexity, but only to decide how many chunks to write
- issue triage becomes analogous to interview/design input: it produces chunk files, then hands off to the canonical execution path
- both one-shot and chunked issue decomposition produce the same chunk-file artifacts used elsewhere in the CLI
- completion checkpoints align with orchestrator semantics using `${taskId}:done`
- issue-aware PR behavior remains explicit, including `{ issueNumber }` and `IssueOutcome.prUrl`

## Consequences

### Positive

- All issue execution now reuses the normal chunk-file `BeastLoop` path instead of mixing direct and chunk-file execution.
- `issues` becomes another input mode into the existing pipeline rather than a second runtime architecture.
- Checkpoint semantics become consistent across issue and non-issue execution.
- Issue PRs retain auto-close behavior and summary reporting.

### Negative

- Even one-shot issues now pay the small cost of writing a plan directory and chunk file before execution.
- Tests must cover both one-chunk and multi-chunk issue generation explicitly.

### Risks

- If issue plan directories drift from normal chunk-file conventions, chunked issues will become another special case.
- PR URL extraction still depends on the issue execution path passing structured result data through correctly.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Revert to the old issue-specific `CliSkillExecutor` loop | Smallest patch, low immediate risk | Preserves a bespoke execution path and duplicates orchestrator behavior | Less standardized and fights the direction of the CLI architecture |
| Split by complexity: one-shot direct, chunked via chunk files | Smaller change than full unification | Still leaves `issues` with two execution paths | Rejected after clarification that issues should only be the work source, not a distinct runtime |
| Run all issues directly as `PlanGraph` tasks inside `BeastLoop` | Single execution surface | Bypasses chunk files entirely and loses the original chunk-file path | Does not preserve the canonical running path |
