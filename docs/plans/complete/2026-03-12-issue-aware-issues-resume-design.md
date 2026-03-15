# Issue-Aware Issues Resume Design

## Goal

Make `frankenbeast issues` treat one-shot issues as issue-scoped Martin executions instead of chunk-scoped work. One-shot issues should resume from existing Martin state and checkpointed commits on the next run, while decomposed chunk tasks keep the existing 10-iteration chunk cap.

## Current Problem

- `IssueRunner` hardcodes `maxIterations: 10` for every issue task.
- The issues path reuses the shared `session` runtime namespace, so Martin session files and checkpoint/log artifacts are not clearly issue-scoped.
- Existing MartinLoop resume support is already present, but the issues path does not provide issue-aware identity to use it cleanly.
- A failed one-shot issue can stop because it crossed the chunk iteration cap even though the work was still making progress.

## Desired Behavior

### One-shot issues

- Use issue-aware Martin runtime identity keyed by issue number.
- Persist issue-scoped runtime artifacts so filenames visibly include `issue-<n>`.
- Resume from the existing Martin session and checkpointed commits on the next `issues` run.
- Continue while progress is being made.
- Stop only on completion, explicit failure, or a stale-mate condition.

### Chunked issues

- Continue to decompose into chunk impl/harden tasks.
- Keep the existing chunk behavior, including `maxIterations: 10`.

## Design

### 1. Issue-scoped runtime identity

For one-shot issues, `IssueRunner` should pass a Martin config whose runtime identity is derived from the issue number rather than the shared session plan namespace.

- `planName`: `issue-<n>`
- `chunkId`: task-specific but still issue scoped, for example `issue-89` or `issue-89-harden`
- `taskId`: existing issue task ids such as `impl:issue-89`

This lets MartinLoop and the chunk session store reuse their existing resume mechanics without a new persistence model.

### 2. Issue-scoped artifacts

The CLI dep factory should provide issue-specific artifact helpers for the issues pipeline.

- checkpoint file names must include the issue number
- log file names must include the issue number
- Martin session files should land under an issue-specific namespace

The implementation should favor deterministic issue-specific names over one shared issues checkpoint/log.

### 3. Resume semantics

On rerun, one-shot issue execution should:

1. load the existing Martin session for the issue task
2. inspect checkpointed commits for the unfinished task
3. recover to the last known good commit when needed
4. continue the Martin session from stored transcript/state
5. only skip the issue when the harden task is complete or the codebase already satisfies completion checks

This is an issue-aware application of the existing Martin resume path, not a second resume subsystem.

### 4. Progress and stale-mate policy

For one-shot issues, a fixed chunk-style cap is the wrong termination rule. The executor should allow one-shot issue work to continue while progress is happening.

Progress signals:

- a new auto-commit was created
- Martin resumed from session state and advanced
- output changed materially toward completion

Stale-mate signals:

- repeated iterations without a new commit
- repeated iterations with no meaningful output change
- no completion signal after a bounded number of non-progress iterations

This keeps one-shot issue work open-ended while still preventing infinite loops.

## Testing

- unit test: one-shot issues do not use the chunk `maxIterations: 10` setting
- unit test: one-shot issues pass issue-aware Martin identity into execution
- unit test: issue runtime artifact names include the issue number
- unit/integration test: rerunning a failed one-shot issue resumes from existing issue-scoped state
- regression test: chunked issue tasks still use chunk semantics and retain the 10-iteration cap
