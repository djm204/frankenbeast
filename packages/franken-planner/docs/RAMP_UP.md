# franken-planner (MOD-04) Ramp-Up

**Status**: **GHOST** — This module is currently **unwired** from the primary `franken-orchestrator` production path. The orchestrator uses internal `LlmGraphBuilder` and `ChunkFileGraphBuilder` logic.

## Module Overview
`franken-planner` is the specialized decomposition engine. It converts user goals into executable DAGs (Directed Acyclic Graphs), enforces Chain-of-Thought (CoT) rationales, and handles self-correction via task injection.

## Current Functionality (Implemented but Unused)
- **PlanGraph**: An immutable DAG structure for managing task dependencies.
- **Strategies**:
    - `LinearPlanner`: Sequential execution.
    - `ParallelPlanner`: Concurrent wave execution.
    - `RecursivePlanner`: Depth-limited task expansion.
- **CoT Gate**: Ensures the agent explains *why* it chose a specific tool before execution.
- **Recovery Controller**: Injects "fix-it" tasks into the DAG when a task fails.

## Integration Gap
The `franken-orchestrator` currently implements its own simplified planning logic. **Phase 8 Focus**: Transition the orchestrator to use this package's robust DAG management and parallel/recursive strategies.

## Key API
- `PlanGraph`: The core immutable data structure.
- `LinearPlanner` / `ParallelPlanner`: Strategy implementations.
- `CoTGate`: Rationale enforcement decorator.

## Build & Test
```bash
npm run build       # tsc
npm test            # vitest run (unit)
npm run test:ci     # full coverage run
```

## Dependencies
- `@franken/types`: For shared TaskId and Rationale shapes.
- No production dependencies (zero-dependency core).
