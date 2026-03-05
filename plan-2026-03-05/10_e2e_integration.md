# Chunk 10: E2E Integration Test

## Objective

Update the existing E2E happy-path test to exercise real skill execution (not stubs) and add a new E2E test that proves the full pipeline works end-to-end with the in-memory ports. Also add an E2E test that verifies logging output.

## Files

- Modify: `franken-orchestrator/tests/e2e/happy-path.test.ts`
- Modify: `franken-orchestrator/tests/helpers/test-orchestrator-factory.ts`
- Modify: `franken-orchestrator/tests/helpers/in-memory-ports.ts`

## Context

Current E2E test uses `createTestOrchestrator()` from `tests/helpers/test-orchestrator-factory.ts`. The `InMemorySkills` now has `execute()` (from chunk 02). The `InMemoryLogger` exists (from chunk 07).

`BeastLoopDeps` now includes `logger: ILogger` and optional `mcp?: IMcpModule` (from chunks 01, 07).

Current `InMemoryPlanner` default plan generates tasks with `requiredSkills: ['code-gen']`.

Current `InMemorySkills` default skills: `code-gen`, `file-write`, `search`.

## Success Criteria

- [ ] `createTestOrchestrator()` updated to include `logger` (InMemoryLogger) in deps
- [ ] `createTestOrchestrator()` returns `{ loop, ports, logger }` — logger exposed for assertions
- [ ] Existing E2E tests still pass — no regressions
- [ ] New test: "skills execute with real skill dispatch" — verifies `InMemorySkills.execute()` is called for each task
- [ ] New test: "skill output flows through to task results" — verifies `TaskOutcome.output` is populated from skill execution
- [ ] New test: "dependency outputs thread between tasks" — task-2 receives task-1's output in `dependencyOutputs`
- [ ] New test: "failed skill execution produces failure outcome" — InMemorySkills configured to throw for a specific skill
- [ ] New test: "logger captures phase transitions" — verify InMemoryLogger entries contain info-level phase logs
- [ ] New test: "debug logging captures detailed data" — verify InMemoryLogger captures debug entries with data
- [ ] All tests pass

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/e2e/ && npx vitest run
```

## Hardening Requirements

- Do NOT break existing tests — all 8 current happy-path tests must pass
- `InMemorySkills.execute()` must return output that is verifiable (the default `Executed ${skillId}: ${input.objective}`)
- For dependency threading test, use a plan with 2 tasks where task-2 depends on task-1
- For failed skill test, configure `InMemorySkills` to throw on a specific skill ID
- `InMemoryLogger` `entries` array is the assertion target — check `level`, `msg`, and optionally `data`
- Test that logger entries include: `Phase: ingestion`, `Phase: hydration`, `Phase: planning`, `Phase: execution`, `Phase: closure`
