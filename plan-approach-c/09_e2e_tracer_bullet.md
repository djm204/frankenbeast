# Chunk 09: E2E Tracer Bullet — Chunk Files Through BeastLoop

## Objective

Prove the full pipeline works end-to-end: chunk files → `ChunkFileGraphBuilder` → `BeastLoop.run()` → impl+harden execution → checkpoints → PR creation. This is Tracer Bullet C.1.

## Files

- **Create**: `franken-orchestrator/tests/e2e/chunk-pipeline.test.ts`

## Key Reference Files

- `franken-orchestrator/src/beast-loop.ts` — `BeastLoop.run()`
- `franken-orchestrator/src/planning/chunk-file-graph-builder.ts` — chunk 02
- `franken-orchestrator/src/checkpoint/file-checkpoint-store.ts` — chunk 01
- `franken-orchestrator/src/closure/pr-creator.ts` — chunk 04
- `franken-orchestrator/src/skills/cli-skill-executor.ts` — Approach A
- `franken-orchestrator/tests/e2e/cli-skill-execution.test.ts` — Approach A E2E pattern

## Design

```typescript
describe.skipIf(!process.env['E2E'])('E2E: Chunk Pipeline', () => {
  it('single chunk file flows through BeastLoop with checkpoints and PR', async () => {
    // 1. Create tmp directory with one chunk .md file
    // 2. Create ChunkFileGraphBuilder(tmpDir)
    // 3. Create mock RalphLoop (returns promise output on first iteration)
    // 4. Create mock GitBranchIsolator (simulates branch create + merge)
    // 5. Create FileCheckpointStore(tmpCheckpointFile)
    // 6. Create mock PrCreator (records gh command)
    // 7. Create BeastLoop with all deps wired
    // 8. Call loop.run({ projectId: 'test', userInput: 'test' })
    //
    // Assertions:
    // - result.status === 'completed'
    // - result.taskResults has 2 entries (impl + harden)
    // - Both tasks have status 'success'
    // - Checkpoint file contains: impl task done, harden task done
    // - PrCreator.create() was called with the result
    // - tokenSpend.totalTokens > 0
  });
});
```

## Success Criteria

- [ ] E2E test guarded with `describe.skipIf(!process.env['E2E'])`
- [ ] Creates tmp chunk file with realistic content (objective, success criteria, verification command)
- [ ] `ChunkFileGraphBuilder` produces PlanGraph with 2 tasks (impl + harden)
- [ ] `BeastLoop.run()` executes both tasks in correct order
- [ ] Mock RalphLoop returns promise-tagged output
- [ ] Mock GitBranchIsolator simulates branch operations
- [ ] `FileCheckpointStore` records progress to a real tmp file
- [ ] Checkpoint file contains per-commit and milestone entries
- [ ] `PrCreator.create()` called with successful `BeastResult`
- [ ] `result.status === 'completed'`
- [ ] `result.taskResults` has 2 entries, both `status: 'success'`
- [ ] `result.tokenSpend.totalTokens > 0`
- [ ] Test passes with `E2E=true npx vitest run tests/e2e/chunk-pipeline.test.ts`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && E2E=true npx vitest run tests/e2e/chunk-pipeline.test.ts && npx tsc --noEmit
```

## Hardening Requirements

- No real Claude/Codex spawn — all mocked
- No real git commands — all mocked
- No real `gh` commands — PrCreator exec is mocked
- Checkpoint file is in a real tmp directory (cleaned up after test)
- Test name clearly states what it proves
- Test must exercise the full BeastLoop pipeline (all 4 phases)
- Do NOT skip ingestion/hydration — use passthrough stubs
