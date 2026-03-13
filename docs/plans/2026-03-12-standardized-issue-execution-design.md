# Standardized Issue Execution Design

## Goal

Make `frankenbeast issues` use the least special-case execution flow possible:

- one-shot issues materialize a single chunk file in an issue-specific plan directory
- chunked issues materialize multiple chunk files in an issue-specific plan directory
- all issue execution then runs through the normal chunk-file `BeastLoop` pipeline

This must restore task execution, checkpoint compatibility, and issue-aware PR behavior for PR #208.

## Decision Change

The initial design draft kept a direct one-shot execution path and only sent chunked issues through chunk files. On 2026-03-12, that was rejected after the PR review findings and follow-up clarification because it still left `issues` with a second runtime path.

Final direction:

- issue triage is only the source of work
- chunk files remain the canonical execution surface
- one-shot issues are represented as a one-chunk plan instead of a direct executor path

## Current Problems

- `IssueRunner` now hands an issue graph to `BeastLoop`, but issue tasks still have `requiredSkills: []`, so execution can become a no-op passthrough.
- The issue fast-path checks bare task IDs in checkpoints, while `runExecution()` writes `${taskId}:done`.
- PR creation for issues lost `{ issueNumber }` context and no longer returns a usable `prUrl`.
- The code claims to standardize around `BeastLoop`, but chunked issues do not actually go through the chunk-file pipeline.

## Decision

All issues standardize on the chunk-file pipeline:

- `IssueGraphBuilder` produces `ChunkDefinition[]`
- one-shot issues yield one chunk definition
- chunked issues yield multiple chunk definitions
- `IssueRunner` writes chunk files into `.frankenbeast/plans/issue-<number>/`
- `BeastLoop` executes those chunk files through `ChunkFileGraphBuilder`
- execution, refresh, checkpoints, and closure all behave like normal chunk-file work

## Architecture

### Dispatcher behavior

`IssueRunner.processIssue()` becomes a chunk-plan dispatcher:

- `one-shot`:
  - build one chunk definition
  - write one issue chunk file
- `chunked`:
  - build multiple chunk definitions
  - write multiple issue chunk files
- both:
  - construct a chunk-file graph builder for the issue plan directory
  - run `BeastLoop` against that plan

### PR behavior

Issue execution cannot rely on generic closure alone because issue runs need issue-aware metadata:

- `PrCreator.create()` still runs from the orchestrator closure path
- issue execution provides `{ issueNumber }`
- `IssueRunner` extracts and returns the created PR URL in `IssueOutcome`

### Checkpoints

The issue runner must stop using bare task IDs for completion checks and instead align to orchestrator semantics:

- pre-run completion check uses `${task.id}:done`
- resumed execution relies on existing `runExecution()` checkpoint behavior

## Testing Strategy

- Unit tests for one-shot execution prove single-chunk issue plans are written and PR metadata survives.
- Unit tests for chunked execution prove multi-chunk issue plan directories are written and normal chunk-file graph builders are used.
- Integration tests for `issues-e2e.test.ts` prove:
  - one-shot issues execute as a one-chunk plan and finish as `fixed`
  - chunked issues execute real impl/harden tasks
  - per-issue failures do not abort later issues

## Non-Goals

- Redesigning the broader `BeastLoop` closure API
- Refactoring all plan-writing responsibilities out of `Session`
- Changing how chunk markdown is rendered outside issue execution
