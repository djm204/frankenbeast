# franken-governor (MOD-07) Ramp-Up

**Status**: **Integrated safety module** — The primary `@franken/orchestrator` CLI dependency path loads `@franken/governor` when the governor module is enabled. The orchestrator falls back to the local passthrough governor only when the module is explicitly disabled, or when an enabled package is missing and `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` opts into unsafe degraded mode. The canonical integration status lives in [`../../../docs/RAMP_UP.md`](../../../docs/RAMP_UP.md).

## Module Overview
`franken-governor` is the Human-in-the-loop (HITL) gateway. It pauses agent execution for human approval on high-stakes actions, such as budget breaches, destructive commands, or low-confidence plans.

## Current Functionality
- **Approval Gateway**: Manages the lifecycle of an approval request across multiple channels.
- **Triggers**:
    - `BudgetTrigger`: Fires when token spend exceeds limits.
    - `SkillTrigger`: Fires for destructive tools or those explicitly marked for HITL.
    - `ConfidenceTrigger`: Fires when LLM confidence is below a threshold.
- **Channels**:
    - `CliChannel`: Interacts with the user via terminal prompt.
    - `SlackChannel`: Sends requests to a Slack webhook and awaits callback.
- **Security**: HMAC-SHA256 signing for secure approval responses.

## Current Orchestrator Wiring
- `packages/franken-orchestrator/src/cli/dep-factory.ts` imports `@franken/governor` lazily when `modules.governor` is enabled.
- TTY CLI runs use `CliChannel` through `ApprovalGateway` and `GovernorPortAdapter`.
- Non-TTY CLI runs reject approvals by default through `GovernorPortAdapter` without prompting on stdin, and only auto-approve when `FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL=1` is set.
- Missing enabled governor packages fail closed by default. Unsafe all-approve fallback requires the explicit `FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES=1` opt-out documented in the root ramp-up guide.

## Narrow Integration Notes
- The package supplies trigger, approval, audit, signing, and session-token primitives; callers remain responsible for supplying live context sources and enforcing approval results at execution boundaries.
- Budget and skill triggers only fire when the caller provides the relevant budget state or skill metadata.
- Keep this package-level note aligned with the canonical root integration story in [`../../../docs/RAMP_UP.md`](../../../docs/RAMP_UP.md), especially the `dep-factory.ts` / `createBeastDeps()` section.

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
