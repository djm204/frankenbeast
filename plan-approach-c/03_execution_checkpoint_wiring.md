# Chunk 03: Wire Checkpoints into Execution Phase

## Objective

Integrate `ICheckpointStore` into the execution phase so that completed tasks are checkpointed and skipped on resume. Wire per-commit checkpoint recording into `CliSkillExecutor`.

## Files

- **Modify**: `franken-orchestrator/src/phases/execution.ts` — check checkpoint before each task, write milestone after completion
- **Modify**: `franken-orchestrator/src/skills/cli-skill-executor.ts` — call `checkpoint.recordCommit()` after each auto-commit
- **Create**: `franken-orchestrator/tests/unit/execution-checkpoint.test.ts`

## Key Reference Files

- `franken-orchestrator/src/phases/execution.ts` — existing `runExecution()` function
- `franken-orchestrator/src/skills/cli-skill-executor.ts` — existing executor
- `franken-orchestrator/src/deps.ts` — `ICheckpointStore` (from chunk 01)
- `franken-orchestrator/src/skills/git-branch-isolator.ts` — `autoCommit()` method
- `franken-orchestrator/tests/helpers/stubs.ts` — test helper factories

## Design

In `runExecution()`:
```typescript
// Before executing each task:
if (checkpoint?.has(`${task.id}:done`)) {
  log('info', `Skipping ${task.id} (checkpointed)`);
  continue; // or push skipped outcome
}

// After successful task execution:
checkpoint?.write(`${task.id}:done`);
```

In `CliSkillExecutor`:
```typescript
// After each auto-commit in the RALPH loop:
checkpoint?.recordCommit(taskId, stage, iteration, commitHash);
```

## Dirty File Resume Logic

On resume, before starting a task that has per-commit checkpoints but no milestone:
1. Check `git status --porcelain` for dirty files
2. Run verification command (tests + tsc)
3. If passing → auto-commit as recovery commit, record checkpoint, continue
4. If failing → `git reset --hard` to `checkpoint.lastCommit(taskId, stage)`, log what was discarded

## Success Criteria

- [ ] `runExecution()` accepts optional `ICheckpointStore` parameter
- [ ] Completed tasks are skipped when checkpoint entry exists
- [ ] Skipped tasks produce `TaskOutcome` with `status: 'skipped'`
- [ ] Milestone checkpoint `{taskId}:done` written after successful execution
- [ ] `CliSkillExecutor` records per-commit checkpoints via `recordCommit()`
- [ ] Dirty file resume: passing dirty files are auto-committed, failing dirty files are reset
- [ ] Existing execution tests still pass (checkpoint is optional)
- [ ] New tests verify: skip on checkpoint, write on complete, per-commit recording
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run && npx tsc --noEmit`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

- `ICheckpointStore` is optional — all checkpoint calls must be guarded with `checkpoint?.`
- Existing tests must not break (no required changes to test helpers unless adding checkpoint stubs)
- The `stubs.ts` `makeDeps()` should NOT include checkpoint by default (optional, like `mcp`)
- Do NOT change the `runExecution` function signature if avoidable — pass checkpoint through deps or a new options parameter
- Per-commit checkpoint format: `{taskId}:{stage}:iter_{n}:commit_{hash}`
- Milestone checkpoint format: `{taskId}:done`
- Use `.js` extensions in all import paths (NodeNext)
