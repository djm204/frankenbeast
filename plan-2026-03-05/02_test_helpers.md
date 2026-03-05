# Chunk 02: Test Helpers

## Objective

Update the unit test stubs (`makeSkills()`) and E2E in-memory ports (`InMemorySkills`) to implement the new `execute()` method on `ISkillsModule` and the `executionType` field on `SkillDescriptor`. This unblocks all test chunks.

## Context

- Design doc: `docs/plans/2026-03-05-execute-task-workflow-design.md`
- Chunk 01 must be complete (types exist in deps.ts)
- Two files need changes:
  - `franken-orchestrator/tests/helpers/stubs.ts` — vi.fn() mocks for unit tests
  - `franken-orchestrator/tests/helpers/in-memory-ports.ts` — stateful in-memory implementations for E2E tests
  - `franken-orchestrator/tests/helpers/test-orchestrator-factory.ts` — factory that wires in-memory ports into BeastLoop
- `makeSkills()` currently returns `{ hasSkill: vi.fn(() => true), getAvailableSkills: vi.fn(() => []) }`
- `InMemorySkills` currently stores `SkillDescriptor[]` and implements `hasSkill()` and `getAvailableSkills()`
- `makeDeps()` currently wires 8 modules + clock

## Success Criteria

- [ ] `makeSkills()` in stubs.ts includes `execute: vi.fn(async () => ({ output: 'mock-output', tokensUsed: 0 }))` as default
- [ ] `makeDeps()` in stubs.ts includes optional `mcp` field (undefined by default)
- [ ] `InMemorySkills` in in-memory-ports.ts implements `execute(skillId, input): Promise<SkillResult>`
- [ ] `InMemorySkills` accepts an optional `executionHandler` in constructor for custom execute behavior
- [ ] `InMemorySkills` default skill descriptors include `executionType: 'function'`
- [ ] `InMemorySkills` tracks executed skills in a public `executions` array for test assertions
- [ ] `test-orchestrator-factory.ts` updated to handle `InMemorySkills` with execute support
- [ ] All existing unit tests pass: `cd franken-orchestrator && npx vitest run tests/unit/`
- [ ] All existing E2E tests pass: `cd franken-orchestrator && npx vitest run tests/e2e/`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run
```

Expected: ALL existing tests pass (unit + E2E). No new tests in this chunk — just making existing tests compile and pass with the updated interfaces.

## Hardening Requirements

- `makeSkills()` default `execute` mock must return a valid `SkillResult` (not undefined)
- `InMemorySkills.execute()` must throw if `skillId` is not found in the registry (matches real behavior)
- `InMemorySkills.executions` array must capture `{ skillId, input }` for each call (test observability)
- Default `executionHandler` should return `{ output: \`Executed \${skillId}: \${input.objective}\`, tokensUsed: 0 }`
- Existing SkillDescriptor arrays in InMemorySkills must add `executionType: 'function'` to all entries
- The `stubs.ts` `makeSkills` override pattern must still work: `makeSkills({ execute: vi.fn(...) })`
- Import `SkillInput`, `SkillResult` from `../../src/deps.js` in both files

## Exact Changes

### stubs.ts

1. Add `SkillInput`, `SkillResult` to the import from `../../src/deps.js`
2. In `makeSkills()`, add `execute: vi.fn(async () => ({ output: 'mock-output', tokensUsed: 0 }))` before `...overrides`
3. In `makeDeps()`, no change needed (mcp is optional, undefined is valid)

### in-memory-ports.ts

1. Add `SkillInput`, `SkillResult` to the import from `../../src/deps.js`
2. Add `executionHandler` optional constructor parameter to `InMemorySkills`
3. Add `readonly executions: Array<{ skillId: string; input: SkillInput }>` public field
4. Implement `async execute(skillId: string, input: SkillInput): Promise<SkillResult>`
5. Update default skill descriptors to include `executionType: 'function'`

### test-orchestrator-factory.ts

1. Add `InMemorySkillsOptions` to the overrides interface if needed
2. Ensure `InMemorySkills` construction handles the new constructor shape
