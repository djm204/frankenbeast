# Issue Stage-Scoped Completion Design

**Goal:** Ensure issue execution can recognize already-satisfied work with proof, still run hardening, and avoid looping when `impl` and `harden` require different promise tags.

## Context

The current issue pipeline stores chunk sessions by `planName + chunkId`. For issue runs, both `impl` and `harden` share the same `chunkId`, so the hardening stage can reload the implementation stage's session metadata. That leaks the old `taskId` and `promiseTag` back into the prompt and causes the model to keep emitting `IMPL_...` tags while the orchestrator expects `HARDEN_...`.

## Requirements

- `impl` may complete with proof even when no code changes are needed.
- `harden` must still run as a verification stage before the issue is considered complete.
- Stage tags stay exact so `impl` and `harden` are tracked independently.
- Logs should distinguish "no promise tag emitted" from "wrong promise tag emitted".

## Chosen Approach

Use stage-scoped chunk sessions and keep exact-tag completion detection.

- Persist chunk sessions with task identity, not just chunk identity.
- Load/replay only the session for the active stage.
- Keep completion gated on the configured stage tag.
- Parse all emitted `<promise>...</promise>` tags for diagnostics so iteration logs can report mismatches clearly.

## Why This Approach

This fixes the root cause instead of weakening completion rules. It preserves explicit stage accounting, allows proof-only completion when work is already done, and makes future loop diagnoses much easier from logs.

## Expected Behavior

1. `impl` inspects the issue and may conclude it is already satisfied.
2. `impl` emits `IMPL_<chunk>_DONE` with proof.
3. `harden` starts with its own stage-scoped session and verification prompt.
4. `harden` verifies the evidence, emits `HARDEN_<chunk>_DONE`, and the issue exits cleanly.
5. If a stage emits the wrong promise tag, the run does not complete, but logs capture the emitted tag(s).

## Testing Strategy

- Unit test chunk-session storage to prove stage-specific sessions do not collide.
- Unit test MartinLoop promise parsing to capture emitted tags separately from exact-match completion.
- Unit test/session test to prove a hardening run does not reuse implementation session metadata.
- Issue pipeline test to prove an already-satisfied issue can complete `impl` and `harden` without edits or loops.
