# Chunk 06: Build-Runner Refactor to Thin CLI Shell

## Objective

Refactor `plan-beast-runner/build-runner.ts` from a 1,100-line monolith into a ~150-line CLI shell that constructs `BeastLoopDeps` and calls `BeastLoop.run()`. All logic moves to the orchestrator.

## Files

- **Rewrite**: `plan-beast-runner/build-runner.ts` — thin CLI shell
- **Modify**: `plan-beast-runner/run-build.sh` — update if CLI args change
- **Create**: `franken-orchestrator/tests/unit/build-runner-integration.test.ts` — verify the wiring works

## Key Reference Files

- `plan-beast-runner/build-runner.ts` — current 1,100-line implementation
- `franken-orchestrator/src/beast-loop.ts` — `BeastLoop` class
- `franken-orchestrator/src/deps.ts` — `BeastLoopDeps` interface
- `franken-orchestrator/src/planning/chunk-file-graph-builder.ts` — from chunk 02
- `franken-orchestrator/src/checkpoint/file-checkpoint-store.ts` — from chunk 01
- `franken-orchestrator/src/closure/pr-creator.ts` — from chunk 04
- `franken-orchestrator/src/skills/cli-skill-executor.ts` — Approach A
- `franken-orchestrator/src/skills/ralph-loop.ts` — Approach A
- `franken-orchestrator/src/skills/git-branch-isolator.ts` — Approach A
- `franken-observer/src/index.ts` — observer exports

## Design

The new build-runner does only:
1. Parse CLI args (`--base-branch`, `--budget`, `--plan-dir`, `--mode`, `--provider`, `--no-pr`, `--reset`, `--verbose`, `--help`)
2. Based on `--mode`:
   - `chunks` (default): construct `ChunkFileGraphBuilder` with `--plan-dir`
   - `design-doc`: placeholder for chunk 07
   - `interview`: placeholder for chunk 08
3. Construct all `BeastLoopDeps`:
   - `firewall`, `memory`, `planner`, `critique`, `governor`, `heartbeat` — stub/passthrough implementations (these modules aren't wired to real services yet)
   - `observer` — real `TraceContext`/`TokenCounter`/`CostCalculator`/`CircuitBreaker` from franken-observer
   - `cliExecutor` — real `CliSkillExecutor` with `RalphLoop` + `GitBranchIsolator`
   - `checkpoint` — real `FileCheckpointStore`
   - `prCreator` — real `PrCreator` (unless `--no-pr`)
   - `graphBuilder` — selected `GraphBuilder` implementation
4. Call `BeastLoop.run({ projectId, userInput: intent })`
5. Display summary from `BeastResult` (ANSI formatting, budget bar, per-chunk table)
6. Exit with appropriate code

## Success Criteria

- [ ] `build-runner.ts` is under 200 lines
- [ ] CLI args: `--base-branch` (required), `--plan-dir`, `--budget`, `--mode`, `--provider`, `--no-pr`, `--reset`, `--verbose`, `--help`
- [ ] `--mode chunks` (default) uses `ChunkFileGraphBuilder`
- [ ] `--mode design-doc` and `--mode interview` log "not yet implemented" and exit
- [ ] Constructs real `BeastLoopDeps` with observer, cliExecutor, checkpoint, prCreator, graphBuilder
- [ ] Stubs passthrough implementations for firewall, memory, planner, critique, governor, heartbeat
- [ ] Calls `BeastLoop.run()` and displays summary from `BeastResult`
- [ ] SIGINT handler: graceful shutdown (finish current iteration, checkpoint, exit)
- [ ] `--reset` clears checkpoint file
- [ ] Exit code 0 on all tasks passed, 1 on any failure
- [ ] Integration test verifies the dep construction wiring (mock BeastLoop)
- [ ] `npx tsc --noEmit` passes (from repo root or franken-orchestrator)

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

- Do NOT delete the old `build-runner.ts` — rewrite in place
- Summary display should preserve the existing ANSI formatting style (budget bar, status badges)
- Passthrough stubs for unimplemented modules: firewall returns input unchanged, planner throws (graphBuilder used instead), etc.
- `run-build.sh` must still work with the refactored runner
- The old observer wiring (TraceServer on port 4040) should still work via `--verbose`
- Do NOT add new dependencies to `plan-beast-runner/` — it imports from `franken-orchestrator` and `franken-observer`
- Use `.js` extensions in all import paths (NodeNext)
