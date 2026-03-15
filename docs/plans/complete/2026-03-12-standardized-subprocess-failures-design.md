# Standardized Subprocess Failures Design

**Date:** 2026-03-12

**Goal:** Fix provider fallback failures caused by inconsistent subprocess error parsing and establish one standard failure contract for observability across orchestrator command execution.

## Problem

The current orchestrator handles subprocess failures inconsistently:

- `MartinLoop` decides provider fallback from `stderr`-only rate-limit checks
- `CliLlmAdapter` also classifies provider failures from `stderr` only
- later retry-delay parsing already looks at both `stderr` and `stdout`, so the system uses different inputs for classification and recovery
- git and `gh` command helpers surface failures through ad hoc strings, which makes cross-cutting tracking harder

That mismatch means a provider such as Claude can emit a rate-limit message on `stdout`, fail to be recognized as rate-limited, and never fall back to the next provider even though the configured provider chain is valid.

## Decision Evolution

The first version of this work was framed as a narrow provider-fallback patch. That design proposed:

- forwarding provider selection more consistently
- teaching `CliLlmAdapter` to rotate providers on rate limits
- leaving the rest of subprocess error handling unchanged

That direction was rejected during review of the runtime behavior. The root cause is not only provider ordering. It is the lack of one canonical subprocess failure contract. Patching fallback in one path would leave:

- different rules for `MartinLoop` and single-shot adapter calls
- continued inconsistency between human-readable failures and machine-traceable data
- no clean way to standardize git, `gh`, and future command failures for observability

The final design therefore standardizes subprocess failures first, and fixes provider fallback by consuming that shared contract.

## Requirements

- provider fallback must trigger when a provider-specific rate-limit signal appears in either `stdout` or `stderr`
- rate-limit classification, retryability, and retry timing must come from one shared normalization step
- human-readable CLI output should remain readable and broadly familiar
- captured logs and downstream observability should receive one canonical failure shape
- the first rollout must cover the known bug path plus the highest-value subprocess helpers without a repo-wide rewrite

## Chosen Approach

Create a shared subprocess failure contract and classifier, then adopt it in stages.

### Canonical Failure Contract

Add a shared error model under `packages/franken-orchestrator/src/errors/` for spawned command failures. The core shape should include:

- `kind`
- `tool`
- `provider`
- `command`
- `exitCode`
- `timedOut`
- `retryable`
- `rateLimited`
- `retryAfterMs`
- `stdout`
- `stderr`
- `summary`
- `details`

The contract should be broad enough to represent:

- provider rate limits
- generic CLI exits
- process spawn failures
- timeouts
- git and `gh` command failures

### Shared Classification

Add one classifier that accepts raw process output plus optional provider-specific logic. The classifier should:

- build a normalized text surface from `stderr`, `stdout`, and any parsed provider output already available
- use provider hooks to identify rate limits and provider-specific retry timing
- set the canonical fields once so all callers consume the same decision

### Initial Adoption Scope

Adopt the contract first in:

- `MartinLoop`
- `CliLlmAdapter`
- git branch/base-branch helpers
- PR creation helpers

That closes the current bug, standardizes the most operationally important subprocess surfaces, and avoids a broad refactor of every direct command call in one change.

## Data Flow

1. A subprocess returns raw `stdout`, `stderr`, `exitCode`, and timeout state.
2. The shared classifier produces a `CommandFailure` when the run is unsuccessful.
3. Callers branch on normalized fields such as `rateLimited`, `retryable`, and `retryAfterMs`.
4. Loggers render the same object in two views:
   - human-readable terminal lines
   - structured payload in captured logs
5. If an exception must be thrown, the standardized failure object is attached rather than flattened into a lossy string.

## Error Handling

- Provider fallback only happens when the classifier marks the failure as `rateLimited`.
- Non-rate-limit provider exits remain real failures.
- Timeout behavior stays distinct from rate limits even if provider output contains similar text.
- Spawn failures should be surfaced as their own failure kind so sandbox or environment issues are easy to distinguish from provider throttling.

## Testing Strategy

Write tests first for:

- stdout-only rate-limit detection causing fallback
- stderr-only rate-limit detection continuing to work
- timeout classification remaining separate from rate limits
- standardized failure objects produced by `MartinLoop`, `CliLlmAdapter`, git helpers, and PR helpers
- logger capture receiving the canonical fields

## Non-Goals

- replacing every subprocess call in the repository in one pass
- redesigning terminal log styling
- changing successful execution behavior outside the touched subprocess paths
