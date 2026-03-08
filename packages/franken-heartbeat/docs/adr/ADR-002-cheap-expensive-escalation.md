# ADR-002: Cheap-then-Expensive Escalation Pattern

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-heartbeat team

---

## Context

The Heartbeat Loop runs frequently (every 30 minutes or on a cron schedule). Most heartbeats will find nothing actionable. Calling an LLM on every pulse wastes tokens and money. The project outline (MOD-05 reference) mandates cost-conscious operation.

## Decision

Implement a **two-phase escalation pattern**:

1. **Deterministic Check ("Cheap")** — zero LLM tokens:
   - Parse HEARTBEAT.md for pending watchlist items
   - Check git repository status (uncommitted changes)
   - Query token spend from MOD-05
   - Check if current hour matches `deepReviewHour` (e.g., 2 AM)
   - Returns `HEARTBEAT_OK` (sleep) or `FLAGS_FOUND` (escalate)

2. **Self-Reflection ("Expensive")** — only when flags are found:
   - Query MOD-03 and MOD-05 for recent traces
   - Call LLM for pattern analysis, improvement suggestions, tech debt scan
   - Audit conclusions via MOD-06
   - Dispatch actions via MOD-07

The DeterministicChecker is a **composable pipeline** of individual checkers, each returning `Flag[]`. This makes it easy to add new cheap checks without modifying existing code.

## Alternatives Considered

| Option | Reason Rejected |
|--------|-----------------|
| Always run LLM reflection | Wasteful — most heartbeats are no-ops |
| Only run at 2 AM | Misses real-time issues (CI failures, budget overruns) |
| Single monolithic checker | Hard to test and extend; violates SRP |

## Consequences

- **Positive:** Typical heartbeat costs zero tokens.
- **Positive:** Individual checkers are independently testable.
- **Negative:** Two-phase adds complexity vs. a single check.
- **Mitigation:** Clear interface boundary between phases; orchestrator owns the decision.
