# @franken/types Ramp-Up

**Status**: **INTEGRATED (Foundation)** — This is the shared base package for the entire Frankenbeast monorepo. It contains zero-dependency type definitions and branded ID factories used by every other module.

## Module Overview
The package ensures architectural consistency across the monorepo by enforcing a shared language for IDs (Project, Session, Task), Result monads, and core pipeline objects like `TokenSpend`.

## Current Functionality
- **Branded IDs**: Prevents ID confusion at compile time (e.g., you cannot pass a `SessionId` where a `ProjectId` is expected).
- **Result Monad**: Standardized error handling without throwing exceptions in core logic.
- **Severity Enums**: Unified severity levels used by Firewall, Critique, and Heartbeat.
- **LLM Interfaces**: Defines `ILlmClient` and `IResultLlmClient` to ensure interchangeable provider adapters.

## Key Exports

### Branded ID Factories (`src/ids.ts`)
| Type | Factory |
| :--- | :--- |
| `ProjectId` | `createProjectId(string)` |
| `SessionId` | `createSessionId(string)` |
| `TaskId` | `createTaskId(string)` |

### Result Monad (`src/result.ts`)
```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

### Shared Objects
- `TokenSpend`: Tracking input/output tokens and USD cost.
- `RationaleBlock`: Chain-of-Thought reasoning for task execution.
- `FrankenContext`: The shared state object that flows through the `BeastLoop`.

## Build & Test
```bash
npm run build       # tsc
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```

## Dependencies
- **Runtime**: None.
- **Dev**: `typescript`, `vitest`.
