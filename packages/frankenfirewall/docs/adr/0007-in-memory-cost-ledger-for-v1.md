# ADR-0007 — In-Memory CostLedger for v1; External Store Deferred

**Status**: Accepted

## Context

Cost enforcement requires tracking cumulative spend per session so the `ProjectAlignmentChecker` can reject a second call that would push total session spend past the budget ceiling. We need to decide where this state lives.

## Decision

For v1, use an in-memory `CostLedger` (a `Map<session_id, accumulated_usd>`). The ledger is created at application startup and lives for the process lifetime.

This is intentionally scoped:
- Adequate for single-process deployments and testing
- Zero dependencies, zero latency
- State is lost on process restart (acceptable for v1)

## Consequences

- Multi-instance deployments share no cost state — each instance has its own ledger (known limitation for v1)
- When cumulative cost enforcement across restarts or instances is required: new ADR required, likely Redis or a shared database
- `CostLedger` is a pure in-memory class; replacing the backing store is a single-file change
- The `ProjectAlignmentChecker` reads from the ledger before executing; the pipeline writes to it after a successful response
