# Chunk 06: E2E Tests — Verify Real Execution

## Objective

Update the E2E tests to verify that real skill execution flows end-to-end through the Beast Loop. The happy path must show output flowing from skills through to `BeastResult.taskResults`. Add a new E2E test proving dependency outputs thread between tasks. This is the integration proof that the execution gap is closed.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunks 01-05 must be complete
- E2E tests use `InMemorySkills` (now has `execute()` from Chunk 02)
- `InMemorySkills` tracks executions in `executions` array
- Default planner creates tasks with `requiredSkills: ['code-gen']`
- E2E happy path: `tests/e2e/happy-path.test.ts`
- E2E test factory: `tests/helpers/test-orchestrator-factory.ts`

## TDD Process

1. Write new E2E tests
2. Run `cd franken-orchestrator && npx vitest run tests/e2e/` — confirm they pass (implementation from Chunk 03 should cover)
3. If any fail, fix implementation
4. Commit

## Success Criteria

- [ ] Existing happy-path test: `taskResults` entries now have `output` populated (not undefined)
- [ ] New test: skill execution is recorded in `InMemorySkills.executions`
- [ ] New test: dependency outputs flow from task-1 to task-2
- [ ] New test: failed skill causes task failure in BeastResult
- [ ] All E2E tests pass: `cd franken-orchestrator && npx vitest run tests/e2e/`
- [ ] All unit tests still pass: `cd franken-orchestrator && npx vitest run tests/unit/`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run
```

Expected: ALL tests pass (unit + E2E).

## Hardening Requirements

- Do NOT break existing E2E test assertions — they check `status`, `phase`, `tokenSpend`, etc.
- The happy-path assertion `result.taskResults!.every(t => t.status === 'success')` must still hold
- The assertion `ports.memory.traces.length === result.taskResults!.length` must still hold
- New tests must use `createTestOrchestrator()` factory
- Test dependency output threading with a custom `planFactory` that creates 2+ dependent tasks

## Test Code

### New test: Task results include skill output

```typescript
it('task results include output from skill execution', async () => {
  const { loop, ports } = createTestOrchestrator();
  const result = await loop.run(input);

  expect(result.taskResults).toBeDefined();
  for (const task of result.taskResults!) {
    if (task.status === 'success') {
      expect(task.output).toBeDefined();
    }
  }
});
```

### New test: Skills are actually executed

```typescript
it('skills are executed for each task', async () => {
  const { loop, ports } = createTestOrchestrator();
  await loop.run(input);

  expect(ports.skills.executions.length).toBeGreaterThan(0);
  expect(ports.skills.executions[0]!.skillId).toBe('code-gen');
});
```

### New test: Dependency outputs thread between tasks

```typescript
it('passes output from completed task to dependent task', async () => {
  const { loop, ports } = createTestOrchestrator({
    planner: {
      planFactory: () => ({
        tasks: [
          { id: 'a', objective: 'First step', requiredSkills: ['code-gen'], dependsOn: [] },
          { id: 'b', objective: 'Second step', requiredSkills: ['code-gen'], dependsOn: ['a'] },
        ],
      }),
    },
  });

  await loop.run(input);

  // Second execution should have received output from first
  const secondExec = ports.skills.executions[1];
  expect(secondExec).toBeDefined();
  expect(secondExec!.input.dependencyOutputs.size).toBeGreaterThan(0);
  expect(secondExec!.input.dependencyOutputs.has('a')).toBe(true);
});
```

### New test: Failed skill causes task failure in result

```typescript
it('reports task failure when skill execution fails', async () => {
  const { loop } = createTestOrchestrator({
    planner: {
      planFactory: () => ({
        tasks: [
          { id: 'fail-task', objective: 'Will fail', requiredSkills: ['nonexistent-skill'], dependsOn: [] },
        ],
      }),
    },
  });

  const result = await loop.run(input);
  expect(result.status).toBe('failed');
  expect(result.taskResults).toBeDefined();
  expect(result.taskResults![0]!.status).toBe('failure');
});
```
