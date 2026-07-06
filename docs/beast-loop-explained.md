# The Beast Loop — How Frankenbeast Iterates

This document explains the looping and iteration mechanisms that drive Frankenbeast's agent pipeline. The system uses 5 interlocking loops, each with distinct continuation and termination conditions.

> **Implementation status:** This page distinguishes the current Beast Loop wiring from target architecture. The live orchestrator runs a sequential execution phase today; recovery-loop self-correction and parallel/recursive execution waves are documented target behavior until [#496](https://github.com/djm204/frankenbeast/issues/496) and [#497](https://github.com/djm204/frankenbeast/issues/497) land.

---

## Overview

The Beast Loop is not a single loop — it's a pipeline of phases where iteration happens *within* each phase. Cheap checks run first (deterministic evaluators, budget checks, loop detection), and expensive operations (LLM calls, human approval) only trigger when needed. Every loop has a hard upper bound to prevent runaway iteration.

```
User Input
  → Firewall sanitizes
  → Planner creates DAG
  → Critique reviews plan ←──────┐
  → Plan rejected? ──── re-plan ─┘
  → Plan approved
  → Execute tasks sequentially in topo order
      → Task fails? ── record failed task; continue independent ready tasks
          (target: recovery classifies/injects fix; #496)
      → Governor blocks? ── HITL approval ── proceed or abort
      → Loop detected? ── Observer fires event ── halt
      → Budget exceeded? ── Circuit breaker trips ── HITL escalation
  → Closure: token accounting, heartbeat pulse
  → BeastResult
```

---

## Loop 1: The Beast Loop (Outer Pipeline)

**Source:** `@franken/orchestrator/src/beast-loop.ts`

The top-level pipeline runs 4 sequential phases. This is a single pass — iteration happens within the phases, not around them.

| Phase | What Happens | Modules Involved |
|-------|-------------|------------------|
| 1. Ingestion | Firewall sanitizes input, Memory hydrates project context | Firewall, Brain |
| 2. Planning | Planner creates task DAG, Critique reviews it in a loop | Planner, Critique |
| 3. Execution | Tasks run in topological order with HITL governor gates | Skills, Governor, MCP |
| 4. Closure | Token accounting, optional heartbeat pulse, result assembly | Observer, Heartbeat |

**Circuit breakers** can halt execution at any phase:
- Injection detected → immediate halt
- Budget exceeded → HITL escalation
- Critique spiral → HITL escalation

---

## Loop 2: Plan-Critique Loop (Phase 2)

**Source:** `@franken/orchestrator/src/phases/planning.ts`, `franken-critique/src/loop/critique-loop.ts`

This is the primary quality loop. The planner generates a plan, critique reviews it, and the cycle repeats until the plan passes or the iteration limit is hit.

### Orchestrator side

```
for i = 0 to maxCritiqueIterations:
    plan = planner.createPlan()
    review = critique.reviewPlan(plan)
    if review.verdict == 'pass' AND review.score >= minScore:
        break  // plan approved
// if exhausted → CritiqueSpiralError
```

### Critique Loop internals

The Critique Loop itself runs `while(true)` with breaker checks at the top of each iteration:

```
while true:
    breakerResult = checkBreakers(state)
    if breakerResult → return (halted or escalated)

    result = pipeline.run(input)
    iterationCount++

    if result.verdict == 'pass' → return pass
    if iterationCount >= maxIterations → return fail with correction suggestions
```

### Circuit breakers inside the Critique Loop

| Breaker | Triggers When | Action |
|---------|--------------|--------|
| MaxIterationBreaker | `iterationCount >= maxIterations` | Halt |
| TokenBudgetBreaker | Token spend exceeds budget (async check) | Halt |
| ConsensusFailureBreaker | Evaluators can't agree | Escalate to HITL |

### Pipeline short-circuit

The Critique Pipeline runs deterministic evaluators first, then heuristic evaluators. The **safety evaluator** short-circuits the entire pipeline immediately on failure — no other evaluators run.

### Possible verdicts

| Verdict | Meaning |
|---------|---------|
| `pass` | All evaluators passed |
| `fail` | Failed after max iterations; includes correction suggestions |
| `halted` | A breaker tripped with halt action |
| `escalated` | A breaker tripped with escalate action; sent to HITL |

---

## Loop 3: Execution Loop (Phase 3)

**Source:** `@franken/orchestrator/src/phases/execution.ts`

Tasks execute in topological order with dependency tracking:

```
while tasks remain pending:
    find next task whose dependencies are all completed
    → check if task requires HITL approval (governor gate)
    → execute task
    → record trace to memory
    if task succeeded → mark task as completed
    if task failed → record failure; leave it out of the completed set
    if no ready tasks found → deadlock detected → stop
```

### Execution strategies

The live orchestrator execution phase runs topological parallel waves: parallel-safe ready tasks execute together, downstream waves wait for their dependencies to complete, and checkout/HITL-sensitive tasks are serialized. Planner strategy modules still describe additional strategy variants; recursive expansion remains a target planner/orchestrator integration and is not wired into `BeastLoop`/`runExecution` yet.

**Parallel wave execution** (`@franken/orchestrator/src/phases/execution.ts`) — current live behavior
- Each wave contains pending tasks whose dependencies are already completed
- Parallel-safe tasks in a wave run concurrently via `Promise.all`
- CLI-backed and HITL-gated tasks are serialized because they share a checkout and operator approval channel
- A failed task is recorded but not added to the completed set
- Later waves continue with tasks whose dependencies are satisfied; dependents of failed tasks are later skipped as unmet dependencies

**Linear planner strategy** (`@franken/planner/src/planners/linear.ts`) — planner strategy module, not the live orchestrator execution loop
- Tasks execute one at a time in topological order
- First failure stops the strategy sequence

**Parallel planner strategy** (`@franken/planner/src/planners/parallel.ts`) — planner strategy module, mirrored by the live executor's wave scheduling
- Tasks execute in concurrent "waves"
- Each wave contains all tasks whose dependencies are satisfied
- All tasks in a wave run simultaneously via `Promise.all`
- A failure in any wave stops subsequent waves in the planner strategy; the live executor preserves its existing recovery and skip semantics

**Recursive** (`@franken/planner/src/planners/recursive.ts`) — target architecture, not wired into orchestrator execution yet
- Tasks can expand into sub-graphs during execution
- Depth-limited to prevent unbounded recursion
- Sub-graphs are themselves executed in topological order

---

## Loop 4: Recovery Loop (Self-Correction)

**Source:** `@franken/planner/src/planner.ts`, `@franken/planner/src/recovery/recovery-controller.ts`

> **Implementation status:** This is target architecture. The recovery controller exists in planner code, but the live orchestrator execution phase does not yet call it after task failure. Wiring error classification plus fix-it task injection into execution is tracked in [#496](https://github.com/djm204/frankenbeast/issues/496).

When wired, a task failure during execution will let the recovery controller classify the error and attempt to fix it:

```
attempt = 1
loop:
    result = strategy.execute(graph)
    if result.status == 'completed' → done
    if result.status == 'rationale_rejected' → done (governor rejected reasoning)

    // Task failed — attempt recovery
    classify error against known patterns from Memory
    if known error:
        inject "fix-it" task before the failed task
        rebuild graph
        attempt++
    if unknown error:
        escalate to HITL → stop
    if attempt > maxRecoveryAttempts (3):
        stop with failure
```

The recovery controller uses the Brain module to match errors against previously encountered patterns. Known errors get automatic fix-it tasks injected into the plan graph. Unknown errors are escalated to a human.

---

## Loop 5: Feedback and Detection Loops

Three background mechanisms monitor the system for pathological behavior:

### Loop Detector

**Source:** `franken-observer/src/incident/LoopDetector.ts`

Maintains a sliding window over span names. If the same pattern of N spans repeats M times, it fires a `loop-detected` event. This catches situations where the system is stuck repeating the same actions.

```
Example: spans = [plan, critique, fail, plan, critique, fail, plan, critique, fail]
         pattern = [plan, critique, fail] repeated 3 times → loop detected
```

### Circuit Breaker

**Source:** `franken-observer/src/cost/CircuitBreaker.ts`

Checks cumulative token spend against a USD budget limit. When the limit is exceeded, fires a `limit-reached` event. This is a non-blocking check — handlers decide what to do (typically HITL escalation).

### Heartbeat Pulse

**Source:** `@franken/orchestrator/src/adapters/reflection-heartbeat-adapter.ts`; closure heartbeat is invoked through `deps.heartbeat.pulse()` from `@franken/orchestrator/src/phases/closure.ts`, while optional phase-boundary reflection is invoked from `@franken/orchestrator/src/beast-loop.ts`

Runs during the Closure phase when `enableHeartbeat` is true, and after planning/execution phase boundaries when `enableReflection` is true. These flags are independent in the normal CLI wiring: `enableReflection=false` disables phase-boundary reflection, but closure still calls `heartbeat.pulse()` unless `enableHeartbeat=false`. If the CLI dependency factory installs a reflection function, closure heartbeat can make an LLM-backed reflection call; if no reflection function is configured, the adapter returns an empty pulse with `No reflection configured.` Target reflection implementations should follow a cost-conscious pattern:

1. **Deterministic check** (zero LLM cost) — checks watchlist items, git state, token budget
2. If everything is healthy → **early exit**, no LLM call needed
3. If flags detected → **LLM reflection** (expensive) — analyzes traces and patterns
4. **Critique audits** the reflection conclusions
5. **Dispatch actions** — inject improvement tasks, send alerts via governor
6. Can inject new tasks back into the planner for future runs

---

## How the Loops Wire Together

### Intra-loop feedback

| From | To | Mechanism |
|------|----|-----------|
| Critique | Planning | Plan rejection triggers re-planning |
| Execution | Recovery | Target only: failed task triggers error classification and fix-it injection once #496 is wired |
| Governor | Execution | Rationale rejection skips or re-attempts task |
| Recovery | Plan Graph | Target only: new graph version with fix-it task inserted once #496 is wired |

### Inter-module feedback

| From | To | Mechanism |
|------|----|-----------|
| Brain (Memory) | Recovery | Known error patterns inform classification |
| Observer | Governor | Token spend triggers BudgetTrigger |
| Observer | Heartbeat | Token spend + traces inform reflection |
| Observer | Loop Detection | Span names feed into sliding window |
| Heartbeat | Planner | Action dispatcher injects improvement tasks |
| Governor | Heartbeat | HITL gateway receives morning brief and alerts |
| Critique | Brain | Lesson recorder writes to episodic memory |

---

## Termination Conditions Summary

| Loop | Continues When | Stops When |
|------|---------------|------------|
| Plan-Critique | Verdict is not 'pass' and iterations remain | Pass verdict, breaker tripped, or max iterations exhausted |
| Execution | Tasks remain with satisfied dependencies | All tasks complete or deadlock (no ready tasks) |
| Recovery (target, #496) | Task failed and attempt count below max | Completed, max recovery attempts, unknown error escalated, or rationale rejected |
| Parallel Waves (target, #497) | `completedIds.size < totalTasks` and no failures | Failure in any wave or all tasks completed |
| Recursive Expand (target, #497) | Sub-tasks generated and depth below limit | Max recursion depth exceeded or all sub-tasks complete |
| Loop Detector | Pattern hasn't repeated threshold times | Pattern detected — fires event handlers |
| Circuit Breaker | Spend below budget | Budget exceeded — fires event handlers |
| Heartbeat | Flags detected in deterministic check | No flags (early exit) or LLM/audit failure |

---

## Design Principles

1. **Cheap before expensive** — Deterministic checks run before LLM calls. Budget checks run before execution. The system avoids spending tokens unless it has to.

2. **Hard upper bounds everywhere** — Every loop has a maximum iteration count. No loop can run forever. `maxCritiqueIterations`, `maxRecoveryAttempts`, `maxRecursionDepth`, `maxIterations` on breakers.

3. **Escalate, don't crash** — When the system can't resolve a problem automatically (unknown error, consensus failure, critique spiral), it escalates to a human via the Governor rather than failing silently.

4. **Feedback feeds forward** — Lessons from critique go into episodic memory. Recovery uses known errors from memory. Heartbeat injects improvement tasks. Each run makes the next run smarter.

5. **Independence of loops** — Each loop operates on its own state and termination conditions. The orchestrator composes them but doesn't micro-manage their internals. This is enabled by the hexagonal port architecture — modules communicate through typed interfaces, never concrete implementations.
