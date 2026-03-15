# franken-critique (MOD-06) Ramp-Up

**Status**: **GHOST** — This module is currently **unwired** from the primary `franken-orchestrator` production path. The orchestrator uses a `stubCritique` adapter in `dep-factory.ts`.

## Module Overview
`franken-critique` implements the Reflexion pattern for the Beast Loop. It scores agent output (plans or code) using a pipeline of deterministic and heuristic evaluators, forcing a correction loop on failures.

## Current Functionality (Implemented but Unused)
- **Critique Loop**: A while-loop that retries generation until a minimum score is met or a circuit breaker trips.
- **Evaluators**:
    - `SafetyEvaluator`: Checks for guardrail violations.
    - `GhostDependencyEvaluator`: Detects undeclared imports.
    - `ADRCompliance`: Checks against stored Architecture Decision Records.
- **Circuit Breakers**: Prevents infinite critique spirals.

## Integration Gap
The `franken-orchestrator` currently skips the reflection phase by using a stub that returns a perfect score (1.0) for every plan. **Phase 8 Focus**: Implement the real critique loop in the `runPlanning` phase to improve plan quality and safety.

## Key API
- `CritiquePipeline`: Executes a sequence of evaluators.
- `CritiqueLoop`: Orchestrates the retry-until-pass logic.
- `Reviewer`: The high-level factory for creating a pre-wired critique service.

## Build & Test
```bash
npm run build            # tsc
npm test                 # vitest run (unit)
npm run test:integration # full loop verification
```

## Dependencies
- `@franken/types`: For shared Verdict and Severity types.
- `zod`: For evaluation result parsing.
