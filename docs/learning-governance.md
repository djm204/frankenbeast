# Learning governance

Frankenbeast treats post-task learning as a reviewed pipeline, not an automatic memory write.

## Post-task lesson extraction

After a task completes, callers can use `extractPostTaskLessonCandidates()` from `@franken/critique` to turn completion evidence into a review report. The report includes:

- candidate lesson text;
- category: `procedure`, `preference`, `environment-fact`, `task-state`, or `discard`;
- evidence pointer: user correction, tool failure, verification step, completion summary, or task note;
- suggested destination: `skill`, `memory`, `docs`, or `discard`;
- privacy/classification decision; and
- review status.

## Review gate

Every non-discard candidate is emitted as `pending-review` with `persistentWriteAllowed: false`. The extractor never writes to skills, memory, or docs directly. A reviewer or promotion job must approve the exact destination and wording before any durable write happens.

Discarded candidates represent one-off task progress, PR state, or other non-reusable details. They remain in the report for auditability but should not be persisted.

## Destination guidance

- `skill`: reusable procedures and tool-failure workarounds.
- `memory`: durable user preferences or stable environment facts.
- `docs`: operator-facing documentation/runbook changes.
- `discard`: transient task state, issue/PR bookkeeping, or empty/noisy notes.

This keeps user memory compact, routes procedural knowledge to skills or docs, and prevents stale task progress from becoming durable guidance.
