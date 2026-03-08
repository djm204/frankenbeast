# ADR-0002 — UnifiedResponse as Version 1 Canonical Contract

**Status**: Accepted

## Context

The Orchestrator must never see provider-specific response shapes. A normalized contract allows providers to be swapped without changing Orchestrator code. We also need a versioning strategy for when this contract must evolve.

## Decision

`UnifiedResponse` is the sole output type of the pipeline. It carries a `schema_version: 1` literal field. Any breaking change (field removal, type narrowing, semantic change) increments this version and requires:

1. A new ADR superseding this one
2. A migration path for existing consumers
3. A `guardrails.config.json` `schema_version` field bump

Non-breaking additions (new optional fields) do not require a version bump.

The `finish_reason` enum is closed: `stop | tool_use | length | content_filter`. New finish states from providers must map to one of these. If a provider returns an unmapped finish reason, `content_filter` is the safe default, and a `GuardrailViolation` is emitted.

## Consequences

- `UnifiedResponse` is imported from `src/types/`, never redefined
- Tests, mocks, and fixtures use the imported type
- Schema version mismatch between config and response is a hard pipeline failure
