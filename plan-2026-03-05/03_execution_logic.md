# Chunk 03: Execution Logic

## Objective

Replace the stub `executeTask()` in `franken-orchestrator/src/phases/execution.ts` with real skill execution. Wire dependency output threading through `runExecution()`. Record failure traces (not just success). Pass optional `IMcpModule` through.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunks 01-02 must be complete (types + test helpers ready)
- Current `executeTask()` (lines 85-136) hardcodes success at lines 116-128
- Current `runExecution()` (lines 26-83) has the topological loop but no dependency output tracking
- The HITL gate logic (lines 96-114) is correct and should be preserved
- `TaskOutcome` already has `output?: unknown` field — just not populated

## Success Criteria

- [ ] `runExecution()` signature updated to accept optional `IMcpModule` parameter
- [ ] `runExecution()` maintains a `Map<string, unknown>` of completed task outputs
- [ ] `runExecution()` passes `completedOutputs` map to each `executeTask()` call
- [ ] `runExecution()` stores `outcome.output` in the map when a task succeeds
- [ ] `executeTask()` signature updated to accept `completedOutputs: ReadonlyMap<string, unknown>` and optional `IMcpModule`
- [ ] `executeTask()` builds a `SkillInput` from task objective + context + dependency outputs
- [ ] `executeTask()` calls `skills.execute(skillId, input)` for each skill in `task.requiredSkills`
- [ ] `executeTask()` returns `TaskOutcome` with real `output` from skill execution
- [ ] Tasks with `requiredSkills: []` return passthrough output (no skill calls)
- [ ] Tasks with missing skills (`!skills.hasSkill(id)`) fail with descriptive error
- [ ] Failed tasks record a failure trace via `memory.recordTrace()` (currently only success is recorded)
- [ ] All existing tests pass: `cd franken-orchestrator && npx vitest run`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run
```

Expected: ALL existing tests pass. The existing tests use `requiredSkills: []` so they hit the passthrough path.

## Hardening Requirements

- HITL gate logic (lines 96-114) must be preserved exactly — do not refactor it
- `SkillInput.context` must handle the case where `ctx.sanitizedIntent` is undefined (use empty MemoryContext)
- `SkillInput.dependencyOutputs` must be a `ReadonlyMap` snapshot, not a mutable reference
- When multiple `requiredSkills` exist, execute them sequentially and keep the LAST output
- Aggregate `tokensUsed` across all skills for the audit log
- `memory.recordTrace()` must be called in BOTH success and catch paths
- The catch block must NOT re-throw — it returns a failure `TaskOutcome` (existing behavior)
- `span.end()` must still be called in the `finally` block (existing behavior)
- Import `SkillInput`, `IMcpModule` from `../deps.js`

## Exact Changes

### execution.ts — runExecution() (lines 26-83)

1. Add `mcp?: IMcpModule` parameter after `observer`
2. Add `const completedOutputs = new Map<string, unknown>();` after `const completed = new Set<string>();`
3. Update `executeTask()` call to pass `completedOutputs` and `mcp`
4. After `completed.add(task.id)`, add `completedOutputs.set(task.id, outcome.output);`

### execution.ts — executeTask() (lines 85-136)

1. Add `completedOutputs: ReadonlyMap<string, unknown>` and `mcp?: IMcpModule` parameters
2. Replace lines 116-128 (the stub) with:
   - Build `SkillInput` from task + context + completedOutputs
   - Loop through `task.requiredSkills`, call `skills.execute(skillId, input)` for each
   - Handle `requiredSkills: []` as passthrough
   - Handle missing skills (`!skills.hasSkill(id)`) with thrown error
   - Record trace with real outcome
   - Return `TaskOutcome` with `output`
3. In the catch block, add `memory.recordTrace()` with `outcome: 'failure'`

### execution.ts — imports

Add `SkillInput`, `IMcpModule` to the import from `../deps.js`
