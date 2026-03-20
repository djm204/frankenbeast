# Phase 6: Absorb Reflection into Critique

**Goal:** Heartbeat's reflection capability becomes a standard critique evaluator in `franken-critique`, and the orchestrator regains the lost "periodic self-assessment" behavior behind an explicit run-config flag.

**Dependencies:** Phase 1 (franken-heartbeat deleted)

**Why this matters:** Reflection ("am I on the right track?") is conceptually identical to critique evaluation ("is this work good enough?"). Making it a pluggable evaluator means it can be added to any critique chain via config, without special-casing.

---

## Design

Reflection becomes `ReflectionEvaluator` — an `ICritiqueEvaluator` that uses an LLM to evaluate execution progress. Unlike static evaluators (lint, test pass/fail), this one asks the LLM: "Given what you've done so far, is this the right approach?"

The orchestrator can optionally run reflection between execution phases via a config flag (`reflection: true` in run config). Defining the evaluator is only half the job; the runtime hook must also be specified so the Phase 1 heartbeat deletion does not silently remove periodic self-assessment.

## Chunks

| # | Chunk | Committable Unit |
|---|-------|-----------------|
| 01 | [ReflectionEvaluator](phase6-reflection-critique/01_reflection-evaluator.md) | New evaluator in `franken-critique` |
| 02 | [Reflection runtime trigger](phase6-reflection-critique/02_reflection-runtime-trigger.md) | Run-config flag + phase-boundary heartbeat pulses |

**Execution:** Chunk 01 first, then Chunk 02 wires the runtime behavior through the existing orchestrator heartbeat port.
