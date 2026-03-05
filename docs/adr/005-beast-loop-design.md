# ADR-005: Beast Loop Pipeline Design

## Status
Accepted

## Context
Need to wire 8 modules into a coherent agent pipeline with clear phase boundaries and error handling.

## Decision
The Beast Loop runs 4 sequential phases:

1. **Ingestion** — Firewall sanitization + Memory hydration
2. **Planning** — Plan creation + Critique review loop (max N iterations)
3. **Execution** — Topological task execution with HITL gates
4. **Closure** — Token accounting + Heartbeat pulse + Result assembly

A mutable `BeastContext` flows through all phases, accumulating state and audit entries.

## Consequences
- Clear phase boundaries enable circuit breakers at each transition
- Mutable context simplifies inter-phase communication
- Topological execution handles task dependencies
- Trade-off: sequential phases limit parallelism (future: parallel task execution within Phase 3)
