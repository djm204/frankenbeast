# Chunk 02: Test Helpers

## Objective

Update unit test stubs (`makeSkills()`) and E2E in-memory ports (`InMemorySkills`) to implement the new `execute()` method. All existing tests must pass after this change.

## Files

- Modify: `franken-orchestrator/tests/helpers/stubs.ts`
- Modify: `franken-orchestrator/tests/helpers/in-memory-ports.ts`

## Success Criteria

- [ ] `makeSkills()` includes `execute: vi.fn(async () => ({ output: 'mock-output', tokensUsed: 0 }))`
- [ ] `InMemorySkills` implements `execute(skillId, input): Promise<SkillResult>` — returns `{ output: \`Executed \${skillId}: \${input.objective}\`, tokensUsed: 0 }`
- [ ] `InMemorySkills` has public `executions: Array<{ skillId: string; input: SkillInput }>` for test assertions
- [ ] `InMemorySkills.execute()` throws if skill not found
- [ ] Default skill descriptors include `executionType: 'function'`
- [ ] All existing tests pass

## Verification Command

```bash
cd franken-orchestrator && npx vitest run
```

## Hardening Requirements

- Import `SkillInput`, `SkillResult` from `../../src/deps.js`
- `makeSkills()` override pattern must still work: `makeSkills({ execute: vi.fn(...) })`
- `InMemorySkills` constructor shape must remain backward compatible (existing tests pass without changes)
