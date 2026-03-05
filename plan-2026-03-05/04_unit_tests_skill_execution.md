# Chunk 04: Unit Tests — Skill Execution

## Objective

Write TDD-style unit tests for the new `executeTask()` skill execution behavior. Tests must be written FIRST, then implementation verified against them. Each test covers one specific behavior. Atomic commits per test-implementation pair.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunks 01-03 must be complete (types, helpers, execution logic)
- Test file: `franken-orchestrator/tests/unit/phases/execution.test.ts`
- Existing tests use `requiredSkills: []` — they test the passthrough path
- New tests must cover tasks WITH required skills
- Test helpers: `makeSkills()`, `makeGovernor()`, `makeMemory()`, `makeObserver()` from `../../helpers/stubs.js`
- `makeSkills()` now has `execute: vi.fn(async () => ({ output: 'mock-output', tokensUsed: 0 }))`

## TDD Process

For EACH test below:
1. Write the failing test
2. Run `cd franken-orchestrator && npx vitest run tests/unit/phases/execution.test.ts` — confirm FAIL
3. If it already passes (implementation from Chunk 03 covers it), move to next test
4. If it fails, fix the implementation to make it pass
5. Run tests again — confirm PASS
6. Commit: `git add -A && git commit -m "test: <description>"`

## Success Criteria

- [ ] Test: task with requiredSkills calls `skills.execute()` for each skill
- [ ] Test: `skills.execute()` receives correct `SkillInput` with objective, context, and dependencyOutputs
- [ ] Test: task output is returned in `TaskOutcome.output`
- [ ] Test: skill not found (`hasSkill` returns false) results in task failure
- [ ] Test: skill execution error (execute throws) results in task failure with error message
- [ ] Test: failed task records failure trace via `memory.recordTrace()` with `outcome: 'failure'`
- [ ] Test: multiple requiredSkills execute sequentially, last output returned
- [ ] Test: dependency outputs from completed tasks are passed to subsequent tasks
- [ ] Test: passthrough task (requiredSkills: []) returns passthrough output without calling execute
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run tests/unit/phases/execution.test.ts`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run tests/unit/phases/execution.test.ts
```

Expected: ALL tests pass (existing + new).

## Hardening Requirements

- Each test must be independent — no shared mutable state between tests
- Use `vi.fn()` with specific return values, not shared fixtures
- Test error messages contain the skill ID that failed
- Test that `memory.recordTrace` is called with `outcome: 'failure'` (not just 'success')
- Test that `span.end()` is still called even when execution fails (finally block)
- Tests must use the `ctx()` helper already in the file for creating BeastContext

## Test Code

### Test 1: Task calls skills.execute for each required skill

```typescript
it('calls skills.execute() for each required skill', async () => {
  const skills = makeSkills({
    getAvailableSkills: vi.fn(() => [
      { id: 'code-gen', name: 'Code Gen', requiresHitl: false, executionType: 'function' as const },
    ]),
  });
  const c = ctx([
    { id: 't1', objective: 'generate code', requiredSkills: ['code-gen'], dependsOn: [] },
  ]);

  await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

  expect(skills.execute).toHaveBeenCalledTimes(1);
  expect(skills.execute).toHaveBeenCalledWith(
    'code-gen',
    expect.objectContaining({ objective: 'generate code' }),
  );
});
```

### Test 2: Skill input includes context and dependency outputs

```typescript
it('passes context and dependency outputs in SkillInput', async () => {
  const skills = makeSkills({
    getAvailableSkills: vi.fn(() => [
      { id: 's1', name: 'S1', requiresHitl: false, executionType: 'function' as const },
      { id: 's2', name: 'S2', requiresHitl: false, executionType: 'function' as const },
    ]),
    execute: vi.fn(async () => ({ output: 'result-from-s1', tokensUsed: 10 })),
  });
  const c = ctx([
    { id: 't1', objective: 'first', requiredSkills: ['s1'], dependsOn: [] },
    { id: 't2', objective: 'second', requiredSkills: ['s2'], dependsOn: ['t1'] },
  ]);
  c.sanitizedIntent = { goal: 'test', context: { adrs: ['ADR-1'], knownErrors: [], rules: ['rule-1'] } };

  await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());

  const secondCall = (skills.execute as ReturnType<typeof vi.fn>).mock.calls[1];
  expect(secondCall[1].dependencyOutputs.get('t1')).toBe('result-from-s1');
  expect(secondCall[1].context).toEqual({ adrs: ['ADR-1'], knownErrors: [], rules: ['rule-1'] });
});
```

### Test 3: Task output flows through to TaskOutcome

```typescript
it('returns skill output in TaskOutcome', async () => {
  const skills = makeSkills({
    getAvailableSkills: vi.fn(() => [
      { id: 'gen', name: 'Gen', requiresHitl: false, executionType: 'function' as const },
    ]),
    execute: vi.fn(async () => ({ output: { code: 'console.log("hi")' }, tokensUsed: 5 })),
  });
  const c = ctx([
    { id: 't1', objective: 'generate', requiredSkills: ['gen'], dependsOn: [] },
  ]);

  const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());
  expect(outcomes[0]!.output).toEqual({ code: 'console.log("hi")' });
});
```

### Test 4: Skill not found fails the task

```typescript
it('fails task when skill is not found', async () => {
  const skills = makeSkills({
    hasSkill: vi.fn(() => false),
    getAvailableSkills: vi.fn(() => []),
  });
  const c = ctx([
    { id: 't1', objective: 'run missing', requiredSkills: ['nonexistent'], dependsOn: [] },
  ]);

  const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());
  expect(outcomes[0]!.status).toBe('failure');
  expect(outcomes[0]!.error).toContain('nonexistent');
});
```

### Test 5: Skill execution error fails the task

```typescript
it('fails task when skill.execute() throws', async () => {
  const skills = makeSkills({
    execute: vi.fn(async () => { throw new Error('LLM timeout'); }),
  });
  const c = ctx([
    { id: 't1', objective: 'fail', requiredSkills: ['code-gen'], dependsOn: [] },
  ]);

  const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());
  expect(outcomes[0]!.status).toBe('failure');
  expect(outcomes[0]!.error).toContain('LLM timeout');
});
```

### Test 6: Failed task records failure trace

```typescript
it('records failure trace when task fails', async () => {
  const memory = makeMemory();
  const skills = makeSkills({
    hasSkill: vi.fn(() => false),
  });
  const c = ctx([
    { id: 't1', objective: 'doomed', requiredSkills: ['missing'], dependsOn: [] },
  ]);

  await runExecution(c, skills, makeGovernor(), memory, makeObserver());
  expect(memory.recordTrace).toHaveBeenCalledWith(
    expect.objectContaining({ taskId: 't1', outcome: 'failure' }),
  );
});
```

### Test 7: Multiple skills execute sequentially, last output returned

```typescript
it('executes multiple skills sequentially and returns last output', async () => {
  let callCount = 0;
  const skills = makeSkills({
    getAvailableSkills: vi.fn(() => [
      { id: 'a', name: 'A', requiresHitl: false, executionType: 'function' as const },
      { id: 'b', name: 'B', requiresHitl: false, executionType: 'function' as const },
    ]),
    execute: vi.fn(async () => {
      callCount++;
      return { output: `output-${callCount}`, tokensUsed: 5 };
    }),
  });
  const c = ctx([
    { id: 't1', objective: 'multi', requiredSkills: ['a', 'b'], dependsOn: [] },
  ]);

  const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());
  expect(skills.execute).toHaveBeenCalledTimes(2);
  expect(outcomes[0]!.output).toBe('output-2');
});
```

### Test 8: Passthrough task returns without calling execute

```typescript
it('returns passthrough output for task with no required skills', async () => {
  const skills = makeSkills();
  const c = ctx([
    { id: 't1', objective: 'no skills needed', requiredSkills: [], dependsOn: [] },
  ]);

  const outcomes = await runExecution(c, skills, makeGovernor(), makeMemory(), makeObserver());
  expect(outcomes[0]!.status).toBe('success');
  expect(outcomes[0]!.output).toBeDefined();
  expect(skills.execute).not.toHaveBeenCalled();
});
```

### Test 9: Span still ends when execution fails

```typescript
it('ends span even when task fails', async () => {
  const observer = makeObserver();
  const endFn = vi.fn();
  (observer.startSpan as ReturnType<typeof vi.fn>).mockReturnValue({ end: endFn });
  const skills = makeSkills({
    hasSkill: vi.fn(() => false),
  });
  const c = ctx([
    { id: 't1', objective: 'fail', requiredSkills: ['nope'], dependsOn: [] },
  ]);

  await runExecution(c, skills, makeGovernor(), makeMemory(), observer);
  expect(endFn).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1' }));
});
```
