# Frankenbeast Orchestrator Functional Overview

Frankenbeast's orchestrator is the stateful supervisor for the Beast Loop. It moves
work through guarded ingestion, planning, execution, and closure while carrying a
shared context object across modules so each step sees the same security,
planning, memory, approval, and observability state.

This page is a functional overview, not the authoritative package inventory. For
current package ownership, see the [root README workspace table](../README.md#current-workspace-packages)
and [architecture package table](ARCHITECTURE.md#system-overview). The `MOD-*`
names below remain useful design vocabulary, but several earlier standalone
packages have been consolidated into the current workspaces, especially
`@franken/orchestrator`, `@franken/mcp-suite`, and the shared `@franken/*`
packages.

## Executive summary

The orchestrator coordinates eight conceptual modules:

| Module | Conceptual role | Current implementation notes |
|--------|-----------------|------------------------------|
| MOD-01 Guardrails / Firewall | Sanitize input and fail closed on unsafe requests. | Firewall middleware and safety checks are wired through `@franken/orchestrator`. |
| MOD-02 Skills / Execution | Run approved work steps. | CLI skill execution and provider registry live in `@franken/orchestrator`; MCP lives in `@franken/mcp-suite`. |
| MOD-03 Memory | Hydrate context and record useful state. | Working memory and episodic recall live in `@franken/brain`, with orchestrator adapters handling runtime wiring. |
| MOD-04 Planner | Create the task DAG or execution roadmap. | Planning primitives live in `@franken/planner`; the orchestrator owns runtime coordination. |
| MOD-05 Observability | Trace spans, token/cost accounting, loop detection, and circuit breakers. | Implemented by `@franken/observer` and orchestrator bridges. |
| MOD-06 Critique | Review plans or outputs and request corrections. | Implemented by `@franken/critique`; callers apply the feedback. |
| MOD-07 Human-in-the-loop (HITL) | Pause high-stakes actions for signed approval. | Implemented by `@franken/governor` plus orchestrator approval paths. |
| MOD-08 Heartbeat | Reflect on outcomes and dispatch proactive follow-up where configured. | Heartbeat/reflection adapters are wired through `@franken/orchestrator`. |

## The orchestrator lifecycle: the Beast Loop

The Beast Loop has four phases. The flow is intentionally non-linear: critique, approval, budget, or safety failures can stop execution or send the loop back to an earlier phase.

### Phase 1: ingestion and hydration

- Intercept raw user input.
- Scan or transform the request through guardrails/firewall logic.
- Hydrate the shared context with project state, relevant memory, configuration, and policy.
- Fail fast if injection, policy, or security checks reject the request.

### Phase 2: recursive planning

- Generate a plan, task DAG, or execution strategy.
- Review that plan through the critique path.
- Re-plan when critique reports a fixable problem, such as violating repository conventions or missing required validation.
- Escalate to HITL when critique repeatedly fails or the request requires human judgement.

### Phase 3: validated execution

- Execute approved tasks in dependency order.
- Use the configured CLI/provider execution path for local work; use MCP paths only when a live MCP transport is configured.
- Pause for HITL approval before high-stakes actions.
- Record each result through memory and observability adapters.

### Phase 4: observability and closure

- Finalize traces, token/cost accounting, and circuit-breaker state.
- Persist useful execution state for recovery and later analysis.
- Assemble the final result for the caller.
- Trigger heartbeat/reflection behavior where enabled.

## Shared state: `FrankenContext`

The orchestrator passes a shared context through the loop so modules operate on a consistent view of the work.

| Data category | Purpose |
|---------------|---------|
| Global state | Project ID, security level, run configuration, provider settings, and token/cost budget. |
| Plan state | Active task DAG, current node, dependencies, approval state, and progress. |
| Memory state | Hydrated working memory, episodic events, checkpoints, and recovery references. |
| Safety state | Guardrail decisions, critique results, HITL requirements, and circuit-breaker status. |
| Observability state | Trace IDs, spans, token usage, cost totals, logs, and exported diagnostics. |
| Execution state | Tool/provider selection, task outputs, errors, retries, and final result assembly. |

This shared context is the mechanism behind Frankenbeast's "brutal honesty" principle: each module can see the same facts instead of relying on hidden or prompt-only assumptions.

## Code example

The sketch below shows the conceptual control flow. It is intentionally
pseudo-code; package and adapter names should be checked against the current
README and architecture docs before implementation work.

```ts
async function orchestrate(userInput: string) {
  const context = await initializeContext(userInput);

  context.input = await guardrails.sanitize(context, userInput);
  await memory.hydrate(context);

  while (context.planStatus !== 'APPROVED') {
    context.plan = await planner.createPlan(context);
    context.lastCritique = await critique.review(context.plan, context);

    if (context.lastCritique.passed) {
      context.planStatus = 'APPROVED';
    } else if (context.lastCritique.canReplan) {
      await planner.applyFeedback(context, context.lastCritique);
    } else {
      await governor.requestHumanDecision(context);
    }
  }

  for (const task of context.plan.tasks) {
    if (task.requiresApproval) {
      await governor.waitForHuman(task, context);
    }

    const result = await skills.execute(task, context);
    await memory.record(task, result, context);
    await observer.trace(task, result, context);
  }

  await heartbeat.reflect(context);
  return observer.finalize(context);
}
```

## Failure handling: circuit breakers

The orchestrator is designed to fail closed when safety or correctness checks cannot be satisfied.

| Failure class | Default response |
|---------------|------------------|
| Security breach | Stop immediately when guardrails detect injection, unsafe commands, or policy violations. |
| Budget overrun | Break or pause the loop and escalate through HITL when token/cost limits are exceeded. |
| Critique spiral | Escalate when repeated critique rounds cannot produce an approved plan. |
| Missing execution transport | Fail closed instead of pretending MCP or provider execution is available. |
| Approval denial | Stop the protected action and preserve an audit trail. |

## Current-vs-historical reading guide

- Treat `MOD-*` names as conceptual roles, not current package names.
- Treat `@franken/orchestrator`, `@franken/mcp-suite`, `@franken/brain`,
  `@franken/planner`, `@franken/observer`, `@franken/critique`,
  `@franken/governor`, `@franken/types`, `@franken/web`, and
  `@franken/live-bench` as the current package surfaces.
- Treat references to removed packages such as `frankenfirewall`,
  `franken-skills`, `franken-heartbeat`, `franken-mcp`, or `franken-comms` as
  historical architecture vocabulary unless a current README or source file says
  otherwise.
