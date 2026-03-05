# Chunk 03: Execution Logic

## Objective

Replace the stub `executeTask()` in `franken-orchestrator/src/phases/execution.ts` with real skill execution. Thread dependency outputs between tasks. Record failure traces. Accept optional `IMcpModule`.

## Files

- Modify: `franken-orchestrator/src/phases/execution.ts`

## Success Criteria

- [ ] `runExecution()` accepts optional `IMcpModule` as 6th parameter
- [ ] `runExecution()` tracks a `Map<string, unknown>` of completed task outputs
- [ ] `runExecution()` passes `completedOutputs` and `mcp` to `executeTask()`
- [ ] `runExecution()` stores `outcome.output` in map on success
- [ ] `executeTask()` builds `SkillInput` from task + context + dependency outputs
- [ ] `executeTask()` calls `skills.execute(skillId, input)` for each skill in `task.requiredSkills`
- [ ] Tasks with `requiredSkills: []` return passthrough output (no `skills.execute()` call)
- [ ] Missing skills (`!skills.hasSkill(id)`) cause task failure with descriptive error
- [ ] Failed tasks record failure trace via `memory.recordTrace({ outcome: 'failure' })`
- [ ] `TaskOutcome.output` is populated with real skill output
- [ ] All existing tests pass

## Verification Command

```bash
cd franken-orchestrator && npx vitest run
```

## Hardening Requirements

- Preserve HITL gate logic (lines 96-114) exactly — do not refactor
- Handle `ctx.sanitizedIntent` being undefined (use empty MemoryContext)
- Multiple `requiredSkills` execute sequentially; keep last output
- Aggregate `tokensUsed` across skills for audit
- `memory.recordTrace()` must be called in both success AND catch paths
- `span.end()` must always run (finally block — existing behavior)
- Import `SkillInput`, `IMcpModule` from `../deps.js`
