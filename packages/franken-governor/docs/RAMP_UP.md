# franken-governor (MOD-07) Ramp-Up

**Status**: **GHOST** — This module is currently **unwired** from the primary `franken-orchestrator` production path. The orchestrator uses a `stubGovernor` adapter in `dep-factory.ts`.

## Module Overview
`franken-governor` is the Human-in-the-loop (HITL) gateway. It pauses agent execution for human approval on high-stakes actions, such as budget breaches, destructive commands, or low-confidence plans.

## Current Functionality (Implemented but Unused)
- **Approval Gateway**: Manages the lifecycle of an approval request across multiple channels.
- **Triggers**:
    - `BudgetTrigger`: Fires when token spend exceeds limits.
    - `SkillTrigger`: Fires for destructive tools or those explicitly marked for HITL.
    - `ConfidenceTrigger`: Fires when LLM confidence is below a threshold.
- **Channels**:
    - `CliChannel`: Interacts with the user via terminal prompt.
    - `SlackChannel`: Sends requests to a Slack webhook and awaits callback.
- **Security**: HMCS-SHA256 signing for secure approval responses.

## Integration Gap
The `franken-orchestrator` currently auto-approves all tasks and budget increases because it uses a no-op governor stub. **Phase 8 Focus**: Wire the `CliChannel` and `BudgetTrigger` into the orchestrator's `runExecution` phase.

## Key API
- `ApprovalGateway`: Central point for requesting approvals.
- `TriggerRegistry`: Evaluates multiple triggers against a context.
- `createGovernor`: Factory for wiring a standard HITL setup.

## Build & Test
```bash
npm run build             # tsc
npm test                 # vitest run (unit)
npm run test:integration # full approval flow verification
```

## Dependencies
- `hono`: For the optional callback server.
- `@franken/types`: For shared rationale and verification blocks.
