# ADR-021: Standardized Subprocess Failure Contract

- **Date:** 2026-03-12
- **Status:** Accepted
- **Deciders:** David Mendez

## Context

The orchestrator currently depends on multiple subprocess surfaces:

- provider CLIs used by `MartinLoop` and `CliLlmAdapter`
- git helpers used for branch isolation and repository state
- `gh` helpers used during PR creation

These paths do not expose failures in a consistent format. The most visible consequence is provider fallback:

- the fallback chain is configured correctly
- but rate-limit classification at the decision point only inspects `stderr`
- later retry timing logic already inspects both `stderr` and `stdout`

This inconsistency allows stdout-only rate-limit failures to be treated as generic CLI failures, which prevents fallback even when the next provider is available. It also makes it harder to track, search, and aggregate failures across different subprocess callers.

## Decision Evolution

An earlier design, documented in `docs/plans/2026-03-12-issues-provider-fallback-design.md`, proposed a narrow fix:

- propagate provider selection everywhere
- add fallback rotation to `CliLlmAdapter`
- leave subprocess error handling otherwise unchanged

That design was rejected after deeper debugging. The bug is not only provider propagation. The underlying problem is that subprocess failures are classified and rendered differently in different call sites. Fixing just one caller would leave the same observability and maintainability problem in place.

We therefore changed direction from a provider-specific fallback patch to a standardized subprocess failure contract consumed by all touched callers.

## Decision

Adopt a canonical subprocess failure contract and classifier, then use that contract as the basis for:

1. provider rate-limit detection and fallback
2. retry-after parsing
3. git and `gh` helper failure reporting
4. structured logging and captured observability data

The canonical failure shape includes:

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

The classifier must operate on normalized subprocess output assembled from both `stderr` and `stdout`, while still allowing provider-specific hooks for rate-limit detection and retry timing.

Human-facing terminal output remains readable and concise, but it must be rendered from the canonical failure object instead of bespoke strings.

## Consequences

### Positive

- stdout-only provider throttling can trigger fallback correctly
- retry and observability logic consume one contract instead of ad hoc strings
- git, `gh`, and provider subprocess failures become easier to search and correlate
- future subprocess callers have a standard failure shape to adopt

### Negative

- initial implementation touches multiple operationally sensitive paths
- some tests will need to be rewritten from string matching to structured assertions
- the first rollout still leaves some lower-value subprocess callers on the old pattern until they migrate

### Risks

- if the canonical failure shape becomes too broad too early, callers may start depending on fields they do not need
- if logger rendering changes too aggressively, operator-facing CLI output can regress
- if provider hooks are not threaded correctly, normalization could flatten important provider-specific semantics

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Patch `MartinLoop` and `CliLlmAdapter` to inspect combined stdout/stderr only | Smallest direct fix for the immediate bug | Leaves git/`gh` failures unstandardized and preserves multiple error formats | Solves today’s symptom without solving observability or maintainability |
| Introduce one global command-runner abstraction for every subprocess immediately | Maximum consistency | Much larger refactor surface and higher regression risk | Too broad for the current fix |
| Keep provider-specific fallback logic split by caller | Minimal code motion | Different callers continue making different decisions from the same raw failure | Continues the exact inconsistency that caused the bug |
