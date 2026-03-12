# Standardized Issue Execution Design

## Goal

Make `frankenbeast issues` use the least special-case execution flow possible:

- one-shot issues execute as real CLI-driven tasks through the orchestrator
- chunked issues materialize chunk files in an issue-specific plan directory
- chunked issues then run through the normal chunk-file `BeastLoop` pipeline

This must restore task execution, checkpoint compatibility, and issue-aware PR behavior for PR #208.

## Current Problems

- `IssueRunner` now hands an issue graph to `BeastLoop`, but issue tasks still have `requiredSkills: []`, so execution can become a no-op passthrough.
- The issue fast-path checks bare task IDs in checkpoints, while `runExecution()` writes `${taskId}:done`.
- PR creation for issues lost `{ issueNumber }` context and no longer returns a usable `prUrl`.
- The code claims to standardize around `BeastLoop`, but chunked issues do not actually go through the chunk-file pipeline.

## Decision

### One-shot issues

One-shot issues stay direct, but they must use the same execution contract as normal orchestrator execution:

- `IssueGraphBuilder` emits executable tasks with `requiredSkills: ['cli:<chunk-id>']`
- `IssueRunner` builds an issue-specific `BeastLoopDeps` bag and runs `BeastLoop`
- `IssueRunner` passes issue-specific metadata needed for PR creation and outcome reporting
- checkpoint checks align with `runExecution()` by using `${taskId}:done`

This preserves the simple path for small issues without inventing a second executor.

### Chunked issues

Chunked issues standardize fully on the chunk-file pipeline:

- `IssueGraphBuilder` still decomposes the issue into `ChunkDefinition[]`
- `IssueRunner` writes chunk files into `.frankenbeast/plans/issue-<number>/`
- the runner invokes `BeastLoop` with a `ChunkFileGraphBuilder` rooted at that plan directory
- execution, refresh, checkpoints, and closure all behave like normal chunk-file work

This is the most standardized path because it reuses the existing chunk-file architecture instead of encoding chunk semantics in issue-specific graphs.

## Architecture

### Dispatcher behavior

`IssueRunner.processIssue()` becomes a dispatcher:

- `one-shot`:
  - build an executable graph
  - run `BeastLoop` directly
- `chunked`:
  - build chunk definitions
  - write issue plan files
  - construct a chunk-file graph builder for that plan directory
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

- Unit tests for one-shot execution prove issue graphs are executable and PR metadata survives.
- Unit tests for chunked execution prove issue plan directories are written and normal chunk-file graph builders are used.
- Integration tests for `issues-e2e.test.ts` prove:
  - one-shot issues execute and finish as `fixed`
  - chunked issues execute real impl/harden tasks
  - per-issue failures do not abort later issues

## Non-Goals

- Redesigning the broader `BeastLoop` closure API
- Refactoring all plan-writing responsibilities out of `Session`
- Changing how chunk markdown is rendered outside issue execution
