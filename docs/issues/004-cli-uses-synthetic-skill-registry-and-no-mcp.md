# Issue: CLI Uses A Synthetic Skill List And Cannot Reach Real Skills Or MCP

Severity: high
Area: `franken-orchestrator` execution

## Summary

The local CLI does not use `franken-skills` or `franken-mcp`; it synthesizes `cli:*` skills from chunk filenames.

## Intended Behavior

Execution should resolve real skills through the registry, preserve `requires_hitl` and other constraints, and optionally route MCP-backed tools when available.

## Current Behavior

- `createStubSkills()` infers skills only from numbered `.md` chunk files.
- Every synthetic skill is marked `requiresHitl: false`.
- `execute()` on that skill module throws for non-CLI execution.
- No `mcp` dependency is created in the CLI dep bag.

## Evidence

- `docs/ARCHITECTURE.md:33-43`
- `docs/RAMP_UP.md:13-23`
- `franken-orchestrator/src/cli/dep-factory.ts:66-83`
- `franken-orchestrator/src/cli/dep-factory.ts:172-186`
- `franken-orchestrator/src/deps.ts:34-56`

## Impact

- Skill metadata from `franken-skills` is ignored in the main CLI path.
- HITL requirements from real skill contracts are lost.
- MCP tools are not discoverable or executable from the CLI.

## Acceptance Criteria

- Wire the CLI to a real skill registry adapter.
- Preserve constraint metadata from skill contracts.
- Expose and wire an `IMcpModule` when MCP-backed skills are present.
- Add an execution test proving at least one non-CLI skill path and one MCP tool path.
