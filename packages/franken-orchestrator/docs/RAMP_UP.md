# franken-orchestrator Ramp-Up

**Status**: **INTEGRATED (Primary)** — This is the central package of the Frankenbeast framework. It owns the primary execution loop, CLI session management, and issue automation.

## Module Overview
The `BeastLoop` orchestrator wires all 8 specialized modules into a single agent pipeline. It manages the lifecycle from user intent to final result, including checkpointing, PR creation, and circuit breaking.

## Current Integration Status
While the `BeastLoop` logic is feature-complete, its connection to sibling packages is currently **partially stubbed** in the production CLI path (`src/cli/dep-factory.ts`):

| Module | Integration | Implementation Path |
| :--- | :--- | :--- |
| **Firewall (MOD-01)** | Stubbed | Uses `stubFirewall`; bypasses injection/PII checks. |
| **Skills (MOD-02)** | Synthetic | Uses internal `LlmSkillHandler`; bypasses `franken-skills` registry. |
| **Memory (MOD-03)** | Stubbed | Uses `stubMemory`; no long-term episiodic/semantic storage. |
| **Planner (MOD-04)** | Native | Uses `LlmGraphBuilder` and `ChunkFileGraphBuilder` directly. |
| **Observer (MOD-05)** | **Integrated** | Full OTEL/Trace support via `CliObserverBridge` and `@frankenbeast/observer`. |
| **Critique (MOD-06)** | Stubbed | Uses `stubCritique`; plans are auto-passed. |
| **Governor (MOD-07)** | Stubbed | Uses `stubGovernor`; all actions are auto-approved. |
| **Heartbeat (MOD-08)** | Stubbed | Uses `stubHeartbeat`; no tech-debt reflection. |

## Primary Execution Flows

### 1. Standard Development (`start`)
`Interview -> Design Doc -> Chunk Planning -> Execution (MartinLoop) -> Closure`
- User provides a goal.
- `InterviewLoop` gathers requirements.
- `LlmGraphBuilder` creates a DAG of `impl` and `harden` tasks.
- `BeastLoop` executes tasks sequentially, using `MartinLoop` for autonomous implementation.

### 2. Issue Automation (`issues`)
`Fetcher -> Triage -> Review -> BeastLoop (Unified Pipeline)`
- Fetches open issues from GitHub.
- `IssueTriage` classifies issues as `one-shot` or `chunked`.
- User reviews and approves triage.
- Approved issues are converted to `.md` chunk files and executed via the standard `BeastLoop`.

## Key Components

- **`BeastLoop`**: The four-phase pipeline (`Ingestion -> Hydration -> Planning -> Execution -> Closure`).
- **`MartinLoop`**: The autonomous implementation loop. Spawns CLI providers (Claude, Gemini, Codex), detects `<promise>` tags, and handles rate-limit fallbacks.
- **`ChunkFileGraphBuilder`**: Reads local `.md` chunk files from `.frankenbeast/plans/` to drive execution.
- **`ChatServer`**: A Hono-based WebSocket server that enables real-time interaction with the Beast Loop.

## Build & Test
```bash
npm run build          # tsc
npm test               # vitest run (orchestrator specific)
npm run typecheck      # tsc --noEmit
```

## System Requirements
- Node >= 22
- `@franken/types`
- GitHub CLI (`gh`) for PR creation.
