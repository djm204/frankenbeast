# Chunk 05: Beast Loop Wiring

## Objective

Update `beast-loop.ts` to pass the optional `IMcpModule` to `runExecution()`. This connects the MCP Registry to Phase 3 as shown in the architecture diagram.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunks 01-04 must be complete
- `BeastLoopDeps` now has `readonly mcp?: IMcpModule` (added in Chunk 01)
- `runExecution()` now accepts optional `IMcpModule` parameter (added in Chunk 03)
- `beast-loop.ts` calls `runExecution(ctx, deps.skills, deps.governor, deps.memory, deps.observer)` at line 45-51
- Just need to add `this.deps.mcp` as the 6th argument

## TDD Process

1. Write a test that verifies MCP is passed through to execution
2. Run test — confirm FAIL
3. Update beast-loop.ts
4. Run test — confirm PASS
5. Commit

## Success Criteria

- [ ] Test: BeastLoop passes `deps.mcp` to `runExecution()` when MCP is provided
- [ ] Test: BeastLoop works without MCP (mcp is undefined) — existing behavior
- [ ] `beast-loop.ts` updated to pass `this.deps.mcp` to `runExecution()`
- [ ] All unit tests pass: `cd franken-orchestrator && npx vitest run tests/unit/`
- [ ] All E2E tests pass: `cd franken-orchestrator && npx vitest run tests/e2e/`
- [ ] Build compiles: `cd franken-orchestrator && npx tsc --noEmit`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

Expected: ALL tests pass, zero type errors.

## Hardening Requirements

- `this.deps.mcp` may be undefined — pass it directly (undefined is valid for optional param)
- Do NOT change the BeastLoop constructor signature
- Do NOT add MCP-specific logic to beast-loop.ts — it just passes the dep through
- The comment on line 19 should be updated from "all 8 modules" to "all modules"

## Exact Changes

### beast-loop.ts (lines 44-51)

Change:
```typescript
const outcomes = await runExecution(
  ctx,
  this.deps.skills,
  this.deps.governor,
  this.deps.memory,
  this.deps.observer,
);
```

To:
```typescript
const outcomes = await runExecution(
  ctx,
  this.deps.skills,
  this.deps.governor,
  this.deps.memory,
  this.deps.observer,
  this.deps.mcp,
);
```

### Test file: `tests/unit/beast-loop.test.ts` (or add to existing)

```typescript
it('passes mcp dependency to execution phase', async () => {
  const mockMcp = { callTool: vi.fn(), getAvailableTools: vi.fn(() => []) };
  const deps = makeDeps({ mcp: mockMcp });
  const loop = new BeastLoop(deps);

  const result = await loop.run({ projectId: 'p', userInput: 'test' });
  expect(result.status).toBe('completed');
});

it('works without mcp dependency', async () => {
  const deps = makeDeps(); // mcp is undefined
  const loop = new BeastLoop(deps);

  const result = await loop.run({ projectId: 'p', userInput: 'test' });
  expect(result.status).toBe('completed');
});
```
