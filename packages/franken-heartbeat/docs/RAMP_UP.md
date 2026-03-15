# franken-heartbeat (MOD-08) Ramp-Up

**Status**: **GHOST** — This module is currently **unwired** from the primary `franken-orchestrator` production path. The orchestrator uses a `stubHeartbeat` adapter in `dep-factory.ts`.

## Module Overview
`franken-heartbeat` is a proactive self-reflection module. It wakes up independently of user prompts to inspect system health, analyze tech debt, and proposal improvements via a `HEARTBEAT.md` checklist.

## Current Functionality (Implemented but Unused)
- **Deterministic Checker**: A fast, zero-token phase that scans for git dirty states, budget breaches, or scheduled review hours.
- **Reflection Engine**: An LLM-powered phase that analyzes recent memory and traces to identify recurring patterns or tech debt.
- **Checklist Parser**: Reads and writes the `HEARTBEAT.md` file format.
- **Action Dispatcher**: Injects tasks into the planner or sends morning briefs to the user.

## Integration Gap
The `franken-orchestrator` currently performs no proactive reflection. **Phase 8 Focus**: Wire the `Heartbeat` module into the `runClosure` phase to enable post-execution tech-debt analysis.

## Key API
- `PulseOrchestrator`: Manages the full heartbeat lifecycle (Check -> Reflect -> Dispatch).
- `DeterministicChecker`: Logic for identifying "flags" that require LLM reflection.
- `ReflectionEngine`: Logic for generating improvement proposals.

## Build & Test
```bash
npm run build           # tsc
npm test                # vitest run (unit)
npm run test:integration # full pulse verification
```

## Dependencies
- `@franken/types`: For shared Result and TokenSpend types.
- `zod`: For reflection result schema enforcement.
