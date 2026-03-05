# Chunk 04: Unit Tests — Skill Execution

## Objective

Write unit tests for the new `executeTask()` behavior using TDD. Write each test, run to confirm it passes (implementation from chunk 03 should cover), commit atomically.

## Files

- Modify: `franken-orchestrator/tests/unit/phases/execution.test.ts`

## Success Criteria

- [ ] Test: task with requiredSkills calls `skills.execute()` for each skill
- [ ] Test: `SkillInput` contains correct objective, context, dependencyOutputs
- [ ] Test: skill output flows to `TaskOutcome.output`
- [ ] Test: missing skill (`hasSkill` returns false) → task failure
- [ ] Test: skill execution error → task failure with error message
- [ ] Test: failed task records failure trace (`outcome: 'failure'`)
- [ ] Test: multiple requiredSkills execute sequentially, last output returned
- [ ] Test: dependency outputs from task-1 are available to task-2
- [ ] Test: passthrough task (requiredSkills: []) skips `skills.execute()`
- [ ] All tests pass

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/phases/execution.test.ts
```

## Hardening Requirements

- Each test is independent — no shared mutable state
- Use the existing `ctx()` helper in the file for creating BeastContext
- Use `makeSkills()`, `makeGovernor()`, `makeMemory()`, `makeObserver()` from `../../helpers/stubs.js`
- Commit each test individually: `git commit -m "test: <description>"`
- Import `vi` from vitest for mock functions
- Test error messages contain the skill ID that was not found
