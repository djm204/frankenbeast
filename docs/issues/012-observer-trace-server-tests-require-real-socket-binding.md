# Issue: `franken-observer` TraceServer Tests Require Real Socket Binding

Severity: medium
Area: `franken-observer` test reliability

## Summary

The TraceServer test suite depends on opening a real HTTP listener, which fails in restricted environments and makes the package tests non-hermetic.

## Intended Behavior

Package tests should be runnable in normal CI and sandboxed environments without depending on unrestricted socket binding.

## Current Behavior

- `TraceServer.start()` calls `srv.listen(this.requestedPort)` with no host override.
- The tests start a real server in `beforeEach`.
- In this environment, `franken-observer` tests failed with `listen EPERM: operation not permitted 0.0.0.0`.

## Evidence

- `franken-observer/src/ui/TraceServer.ts:39-52`
- `franken-observer/src/ui/TraceServer.test.ts:17-26`
- Reproduction on 2026-03-08:
  - `cd franken-observer && npm test`

## Impact

- Package tests are environment-sensitive.
- Root test automation can fail for infrastructure reasons rather than logic regressions.
- The runtime server binds more broadly than `localhost` by default.

## Acceptance Criteria

- Bind explicitly to `127.0.0.1` or make host configurable.
- Make tests hermetic, or skip them automatically when socket binding is unavailable.
