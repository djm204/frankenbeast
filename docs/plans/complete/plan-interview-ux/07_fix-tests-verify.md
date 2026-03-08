# Chunk 07: Fix Existing Tests + Full Verification

## Objective

Update any existing tests broken by the `runInterview()` and `runPlan()` changes, then run the full test suite and typecheck to confirm everything passes.

Depends on chunks 05-06 (all wiring complete).

## Files

- **Modify**: `franken-orchestrator/tests/unit/cli/session.test.ts` (update mocks/assertions for new interview flow)
- **Verify**: All test files in `franken-orchestrator/tests/`

## Context

The main expected breakage is in `tests/unit/cli/session.test.ts` — the old `runInterview()` used a different approval flow (possibly `reviewLoop` or direct approve). The new flow uses `io.ask()` with `[c]/[r]/[x]` choices. Tests that mock `io.ask` need to return `'c'` or `'x'` for the new approval gate.

Read `franken-orchestrator/tests/unit/cli/session.test.ts` to understand what needs updating.

## Success Criteria

- [ ] All existing `session.test.ts` tests pass with updated mocks
- [ ] No test uses removed APIs or old approval flow
- [ ] `io.ask` mocks return valid choices (`'c'`, `'r'`, `'x'`) where interview approval is tested
- [ ] Full test suite: `npx vitest run` — ALL PASS
- [ ] Typecheck: `npx tsc --noEmit` — no errors
- [ ] No unrelated test files were modified

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run
```

## Implementation Guidance

1. **Run full suite first** to identify breakages:
   ```bash
   cd franken-orchestrator && npx vitest run 2>&1 | tail -50
   ```

2. **Read failing test files** to understand what mocks need updating

3. **Fix mocks** — the most likely change is:
   - Old: `io.ask` returns approve/deny or `reviewLoop` mock
   - New: `io.ask` returns `'c'` (continue) or `'x'` (exit) for the approval gate

4. **Re-run full suite** to confirm all pass

5. **Run typecheck** to confirm no type errors

## Hardening Requirements

- Do NOT delete existing tests — update them to match the new behavior
- Do NOT add tests that duplicate what chunk 05 already tests
- If a test was testing `reviewLoop` integration that no longer exists, update it to test the new `[c]/[r]/[x]` flow instead
- Every test assertion must be meaningful — no `expect(true).toBe(true)` placeholders
- Run the FULL suite, not just session tests — spinner/progress changes could affect other tests via import resolution
