# ADR-004: Audit Trail via EpisodicTrace to MOD-03

## Status

Accepted

## Context

Every HITL decision must be logged to franken-brain (MOD-03) for governance and learning. The `MemoryOrchestrator.recordToolResult(trace)` method accepts `EpisodicTrace` records. Approved patterns should be recorded as "Preferred Pattern" and rejections should store the reason to prevent repeat proposals.

## Decision

Define a `GovernorMemoryPort` interface (hexagonal architecture port) that MOD-07 depends on. The port has a single `recordDecision(trace)` method. In production, the concrete adapter wraps MOD-03's `MemoryOrchestrator`. In tests, a fake is injected.

The `GovernorAuditRecorder` maps each decision to an `EpisodicTraceRecord`:
- APPROVE -> `status: 'success'`, tags: `hitl:approved`, `hitl:preferred-pattern`
- REGEN -> `status: 'failure'`, tags: `hitl:rejected`, `hitl:rejection-reason`
- ABORT -> `status: 'failure'`, tags: `hitl:aborted`
- DEBUG -> `status: 'success'`, tags: `hitl:debug`

## Consequences

- **Positive:** MOD-07 is decoupled from MOD-03 implementation details via the port.
- **Positive:** Tags enable querying for learning patterns (approved/rejected styles).
- **Positive:** Every decision is traceable with trigger reason, human identity, and timing.
- **Negative:** If MOD-03's `EpisodicTrace` schema changes, the port adapter must be updated.
