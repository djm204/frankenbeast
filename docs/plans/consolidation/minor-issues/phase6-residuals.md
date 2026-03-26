# Phase 6 Residual Issues

Items identified during Phase 6 (Absorb Reflection into Critique) review.

---

## M1. ReflectionEvaluator not wired into critique chain by default

**Status:** Open (intentional)
**Severity:** Medium
**Context:** `ReflectionEvaluator` is exported from `@franken/critique` and can be added to any critique chain. However, no production code currently adds it — dep-factory does not instantiate it or include it in the pipeline. The spec shows it as an optional evaluator enabled via `critique.evaluators: [reflection]` in run config.

**Fix:** Phase 8 — dep-factory reads `critique.evaluators` from run config and conditionally includes `ReflectionEvaluator` in the pipeline.

---

## I1. ReflectionEvaluator uses different type system than @franken/types CritiqueContext

**Status:** Open (by design)
**Severity:** Informational
**Context:** The spec references `ICritiqueEvaluator` with `CritiqueContext`/`CritiqueResult` from `@franken/types`. The actual critique package uses `Evaluator`/`EvaluationInput`/`EvaluationResult`. The evaluator implements the actual types, not the spec's type names. The `CritiqueContext`/`CritiqueResult` types in `@franken/types/provider.ts` are used by the orchestrator for different purposes (Phase 8 beast loop context).

**Fix:** None needed. The evaluator correctly implements the existing `Evaluator` interface. The spec's type references were aspirational names that don't match the implemented system.

---

## I2. Phase-boundary reflection uses heartbeat.pulse(), not ReflectionEvaluator directly

**Status:** Open (by design)
**Severity:** Informational
**Context:** Chunk 6.2 calls `deps.heartbeat.pulse()` at phase boundaries, not `ReflectionEvaluator.evaluate()` directly. The spec notes this: "Phase 8, `ReflectionHeartbeatAdapter` becomes the implementation behind that port." This means reflection runs through the heartbeat port (which currently uses whatever heartbeat implementation is injected), not directly through the critique evaluator.

**Fix:** Phase 8 — create `ReflectionHeartbeatAdapter` that wraps `ReflectionEvaluator` and implements `IHeartbeatModule`, then inject it via dep-factory.

---

## Summary

| ID | Severity | Blocks Phase 6? | Resolution |
|----|----------|-----------------|------------|
| M1 | Medium | No | Phase 8 |
| I1 | Info | No | By design |
| I2 | Info | No | Phase 8 |

**Verdict:** Phase 6 is complete. ReflectionEvaluator exists and is exported. Beast-loop reflection trigger works. Phase 8 wires them together.
