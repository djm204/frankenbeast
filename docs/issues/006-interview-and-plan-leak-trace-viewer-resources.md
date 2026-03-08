# Issue: Interview And Plan Phases Leak Trace Viewer Resources

Severity: medium
Area: `franken-orchestrator` CLI resource management

## Summary

`createCliDeps()` allocates trace-viewer and observer resources for interview and plan phases, but those phases never call `finalize()`.

## Intended Behavior

Every `createCliDeps()` call should release any trace viewer and related resources after the phase completes.

## Current Behavior

- `createCliDeps()` can start a trace viewer in verbose mode and returns a `finalize()` hook.
- `runInterview()` only reads `cliLlmAdapter`.
- `runPlan()` only reads `cliLlmAdapter` and `logger`.
- Neither phase calls `finalize()`.

## Evidence

- `franken-orchestrator/src/cli/dep-factory.ts:113-170`
- `franken-orchestrator/src/cli/session.ts:84-156`
- `franken-orchestrator/src/cli/session.ts:158-203`

## Impact

- Verbose interview/plan runs can leak a bound trace-viewer server.
- Multi-phase sessions can accumulate unnecessary resources before execution begins.

## Acceptance Criteria

- Ensure `runInterview()` and `runPlan()` finalize deps in `finally` blocks.
- Add a regression test that proves verbose interview/plan do not leave the trace viewer running.
