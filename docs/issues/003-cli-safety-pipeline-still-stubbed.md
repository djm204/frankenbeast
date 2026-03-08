# Issue: Local CLI Still Bypasses Core Safety Modules

Severity: high
Area: `franken-orchestrator` CLI architecture

## Summary

The local `frankenbeast` CLI path still substitutes major Beast Loop modules with permissive stubs.

## Intended Behavior

The CLI should exercise the same deterministic architecture described in the root docs: firewall sanitization, memory hydration, critique, HITL governance, and heartbeat closure.

## Current Behavior

- `stubFirewall` returns the raw input unchanged and never blocks.
- `stubMemory` never hydrates ADRs, rules, or known errors and never records traces.
- `stubCritique` always returns `pass` with score `1.0`.
- `stubGovernor` always returns `approved`.
- `stubHeartbeat` returns an empty pulse result.
- `runPlanning()` short-circuits critique entirely when a `graphBuilder` is supplied.

## Evidence

- `docs/ARCHITECTURE.md:30-57`
- `docs/RAMP_UP.md:33-37`
- `franken-orchestrator/src/cli/dep-factory.ts:45-64`
- `franken-orchestrator/src/cli/dep-factory.ts:172-180`
- `franken-orchestrator/src/phases/planning.ts:39-55`

## Impact

- The CLI does not currently validate user input through the deterministic firewall path.
- Memory-informed planning and recovery context are absent.
- Critique and governance claims do not hold for the local CLI path.
- Heartbeat integration is non-functional in closure.

## Acceptance Criteria

- Replace stub module deps with real adapters to sibling packages, or gate CLI features until those deps are real.
- Ensure graph-builder-based planning still passes through critique.
- Add CLI integration tests that prove firewall blocking, critique failure, governor rejection, and heartbeat behavior in the real path.
