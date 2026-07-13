# @franken/brain (MOD-03) Ramp-Up

**Status**: **WIRED FOR CLI DEPENDENCY CREATION** — `@franken/orchestrator` imports `SqliteBrain`, constructs it in `createBeastDeps()`, wraps it with `SqliteBrainMemoryAdapter`, and returns that adapter as the consolidated `memory` dependency for the Beast loop.

## Module Overview
`@franken/brain` provides the current SQLite-backed runtime memory primitive for Frankenbeast. The public package API is `SqliteBrain`, `WorkingMemoryLimitError`, `DEFAULT_WORKING_MEMORY_LIMITS`, and the `WorkingMemoryLimits` type.

Earlier multi-store and semantic-memory design sketches are historical only until any replacement APIs are reintroduced in `src/index.ts` and covered by tests.

## Current Functionality
- **Working memory**: `SqliteBrain.working` exposes a bounded in-memory key/value store. Working memory is flushed to SQLite when checkpoints or serialization run.
- **Episodic memory**: `SqliteBrain.episodic` records event traces in SQLite and supports recent/failure/query recall.
- **Recovery memory**: `SqliteBrain.recovery` stores execution checkpoints and can return the latest checkpoint for run recovery.
- **Snapshot handoff**: `SqliteBrain.serialize()` and `SqliteBrain.hydrate()` support process handoff and test fixtures.
- **Orchestrator wiring**: `packages/franken-orchestrator/src/cli/create-beast-deps.ts` creates `new SqliteBrain(config.brain?.dbPath ?? ':memory:')`, wraps it in `new SqliteBrainMemoryAdapter(brain)`, and returns that adapter in `createBeastDeps()`.

## Integration Status and Remaining Gaps
`@franken/brain` now participates in the primary `createBeastDeps()` dependency path, so contributors should start by verifying the narrower behavior below instead of assuming a missing adapter integration.

- **Default persistence is ephemeral**: when no `brain.dbPath` is provided, `createBeastDeps()` uses SQLite `:memory:`, so episodic memory is available only for the lifetime of that process.
- **File persistence is configuration-driven**: provide `brain.dbPath` in Beast dependency configuration to keep the SQLite episodic store across process restarts.
- **Long-term memory semantics still need product verification**: validate how CLI/runtime configuration exposes `brain.dbPath`, how episodic traces are retained across runs, and whether semantic/vector memory should return as a new API.
- **Module toggles remain a DX surface**: document and test any future switches that intentionally disable or replace the brain adapter so operators can distinguish configured-off memory from a wiring failure.

## Key API
- `SqliteBrain`: SQLite-backed package entry point used by `createBeastDeps()`.
- `SqliteBrain.working`: bounded working-memory map.
- `SqliteBrain.episodic`: SQLite episodic event store with recent/query/failure recall.
- `SqliteBrain.recovery`: checkpoint storage and latest-checkpoint lookup.
- `SqliteBrainMemoryAdapter`: orchestrator adapter that satisfies the Beast loop memory dependency with a `SqliteBrain` instance.

## Build & Test
```bash
npm run build          # tsc
npm run typecheck      # tsc --noEmit
npm run test           # vitest run (unit)
npm run test:integration # serialize/hydrate lifecycle coverage
```

## Dependencies
- `better-sqlite3`: SQLite storage engine.
- `@franken/types`: For shared context definitions.
