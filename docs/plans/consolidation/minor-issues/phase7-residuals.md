# Phase 7 Residual Issues

Items identified during Phase 7 (Observer Audit Trail) review.

---

## M1. AuditTrail not wired into BeastLoop closure

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The spec says to wire audit persistence into beast-loop closure so the artifact survives process exit. `AuditTrailStore.save()` exists and works, but no production code creates an `AuditTrail`, appends events during execution, or calls `save()` at closure. Same deferral pattern as prior phases.

**Fix:** Phase 8 — create `AuditTrail` in dep-factory, pass to ProviderRegistry's `onProviderSwitch`, record LLM events during execution, call `AuditTrailStore.save()` in closure phase.

---

## M2. Observer events not emitted as AuditEvents during execution

**Status:** Open (intentional)
**Severity:** Medium
**Context:** The existing observer (`TraceContext`, `SpanLifecycle`) records spans in OpenTelemetry format. The new audit event system is separate — it doesn't bridge from existing observer spans to `AuditEvent` records. The two systems coexist but aren't connected.

**Fix:** Phase 8 — either bridge observer spans to audit events, or create a `ObserverAuditAdapter` that wraps `AuditTrail` and emits `AuditEvent` records from span lifecycle callbacks.

---

## I1. Audit events use wall-clock timestamps, not monotonic

**Status:** Open
**Severity:** Informational
**Context:** `createAuditEvent()` uses `new Date().toISOString()` for timestamps. Wall-clock time can be non-monotonic (NTP adjustments). For audit integrity, monotonic timestamps or sequence numbers would be safer. The current implementation is fine for v1 since events are append-only in a single process.

**Fix (optional):** Add a monotonic sequence counter alongside the ISO timestamp.

---

## Summary

| ID | Severity | Blocks Phase 7? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Phase 8 |
| M2 | Medium | No | Phase 8 |
| I1 | Info | No | Optional |

**Verdict:** Phase 7 is complete. Audit event schema, replayer, persistence store all built and tested. Runtime wiring is Phase 8.
