# ADR-002: Hexagonal Architecture (Ports & Adapters)

## Status
Accepted

## Context
Modules need to communicate without tight coupling. The orchestrator should depend on interfaces, not implementations.

## Decision
Each module exposes typed port interfaces. Concrete implementations are injected via a dependency bag (`BeastLoopDeps`). This follows the pattern established by `PulseOrchestratorDeps` in franken-heartbeat.

## Consequences
- Modules can be tested with mock/stub implementations
- New implementations (e.g., new LLM providers) require no orchestrator changes
- Port interfaces live in `@franken/types` for shared contracts, and in module-local types for module-specific ones
