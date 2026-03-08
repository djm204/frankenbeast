# Issue: `franken-heartbeat` CLI Is Stub-Backed Rather Than Real

Severity: high
Area: `franken-heartbeat`

## Summary

The package README presents the CLI as a real heartbeat runner, but the shipped CLI is wired almost entirely to stub modules.

## Intended Behavior

The standalone CLI should exercise real observability, memory, critique, planner, HITL, and LLM integrations, or clearly brand itself as a demo shell.

## Current Behavior

- The CLI uses stub memory, observability, planner, critique, HITL, and LLM deps.
- The non-dry-run path still uses stub planner and stub HITL.
- The returned reflection payload is canned JSON from `stubLlm`.

## Evidence

- `franken-heartbeat/README.md:34-48`
- `franken-heartbeat/README.md:120-135`
- `franken-heartbeat/src/cli/run.ts:18-50`
- `franken-heartbeat/src/cli/run.ts:65-94`

## Impact

- The CLI does not actually validate the package's core integrations.
- Users can misread the CLI as production-ready when it is currently only a scaffold.

## Acceptance Criteria

- Either wire the CLI to real module adapters or mark it explicitly as stub/demo-only in docs and output.
- Add an integration test that proves at least one real dependency path is used by the CLI.
