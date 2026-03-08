# Issue: Root Build/Test Scripts Skip `franken-mcp` And Break After Failures

Severity: medium
Area: repo automation

## Summary

The root automation does not cover all 11 packages and is fragile when any package command fails.

## Intended Behavior

Root `build` and `test:all` should cover every package and fail cleanly without corrupting subsequent directory traversal.

## Current Behavior

- `package.json` omits `franken-mcp` from both the build and test loops.
- The loops use `cd $d && ... && cd ..`; if a command fails, the shell remains in the failed package directory.
- After `franken-observer` test failure, `test:all` continued from the wrong directory and produced `can't cd to franken-planner`, `franken-skills`, `frankenfirewall`, and `franken-orchestrator`.

## Evidence

- `package.json:7-14`
- `docs/RAMP_UP.md:97-100`
- Reproduction on 2026-03-08:
  - `npm run test:all`
  - `npm run build`

## Impact

- Root automation hides MCP regressions.
- A single package failure obscures the real state of the remaining packages.

## Acceptance Criteria

- Include `franken-mcp` in root build/test coverage.
- Replace directory-changing loops with a failure-safe approach.
- Ensure root scripts stop with one clear failure without emitting misleading downstream `cd` errors.
