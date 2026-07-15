# franken-critique (MOD-06) Ramp-Up

**Status**: **Integrated safety module** — The primary `@franken/orchestrator` CLI dependency path loads `@franken/critique` when the critique module is enabled. The orchestrator falls back to the local all-pass critique only when the module is explicitly disabled, or when an enabled package is missing and `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` opts into unsafe degraded mode. The canonical integration status lives in [`../../../docs/RAMP_UP.md`](../../../docs/RAMP_UP.md).

## Module Overview
`franken-critique` implements the Reflexion pattern for the Beast Loop. It scores agent output (plans or code) using a pipeline of deterministic and heuristic evaluators, forcing a correction loop on failures.

## Current Functionality
- **Critique Loop**: A while-loop that retries generation until a minimum score is met or a circuit breaker trips.
- **Evaluators**:
    - `SafetyEvaluator`: Checks for guardrail violations.
    - `GhostDependencyEvaluator`: Detects undeclared imports.
    - `ADRComplianceEvaluator`: Checks against stored Architecture Decision Records.
    - `ReflectionEvaluator`: Produces reflection findings from an LLM-backed adapter.
- **Circuit Breakers**: Prevents infinite critique spirals.
- **Reviewer Facade**: `createReviewer` wires package evaluators behind the interface consumed by the orchestrator adapter.

## Current Orchestrator Wiring
- `packages/franken-orchestrator/src/cli/dep-factory.ts` imports `@franken/critique` lazily when `modules.critique` is enabled.
- `createCritiqueDeps()` builds a package reviewer with guardrail, memory, observability, and known-package ports, then wraps it in `CritiquePortAdapter` for the Beast loop.
- `packages/franken-orchestrator/src/cli/create-beast-deps.ts` also wires `ReflectionEvaluator` into heartbeat reflection when reflection is enabled.
- Missing enabled critique packages fail closed by default. Unsafe all-pass fallback to `stubCritique` requires the explicit `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` opt-out documented in the root ramp-up guide.

## Narrow Integration Notes
- The critique module depends on caller-provided ports for guardrails, memory, observability, known package metadata, and LLM-backed reflection.
- The orchestrator can still use the local all-pass critique stub when critique is deliberately disabled by config or environment.
- Keep this package-level note aligned with the canonical root integration story in [`../../../docs/RAMP_UP.md`](../../../docs/RAMP_UP.md), especially the `dep-factory.ts` / `createBeastDeps()` section.

## Key API
- `CritiquePipeline`: Executes a sequence of evaluators.
- `CritiqueLoop`: Orchestrates the retry-until-pass logic.
- `Reviewer`: The interface of the pre-wired critique service; create one with the `createReviewer` factory.

## Build & Test
```bash
npm run build            # tsc
npm test                 # vitest run (unit)
npm run test:integration # full critique loop verification
```

## Dependencies
- `@franken/types`: For shared Verdict and Severity types.
- `zod`: For evaluation result parsing.
