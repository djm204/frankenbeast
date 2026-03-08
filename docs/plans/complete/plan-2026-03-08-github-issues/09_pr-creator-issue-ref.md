# Chunk 09: PrCreator — Issue Reference Integration

## Objective

Extend `PrCreator` to accept an optional issue number and include `Fixes #<N>` in the PR body. When creating a PR for an issue-sourced task, the PR should auto-close the issue on merge.

## Files

- **Modify**: `franken-orchestrator/src/closure/pr-creator.ts` (add issue ref)
- **Test**: `franken-orchestrator/tests/unit/closure/pr-creator.test.ts` (add test cases)

## Success Criteria

- [ ] `PrCreatorConfig` (or `create()` method) accepts optional `issueNumber?: number`
- [ ] When `issueNumber` is provided, PR body includes `\n\nFixes #<N>` after the summary section
- [ ] When `issueNumber` is NOT provided, PR body is unchanged (backward compatible)
- [ ] LLM-generated PR description prompt mentions the issue number for context
- [ ] Existing PR creator tests still pass
- [ ] New tests verify `Fixes #N` appears in PR body when issue number provided
- [ ] New tests verify PR body unchanged when no issue number
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/closure/pr-creator.test.ts
```

## Hardening Requirements

- `Fixes #N` must be on its own line, not inline with other text (GitHub requires this format)
- Do NOT change the PR title format — only the body
- The `issueNumber` flows from `IssueRunner` → `PrCreator.create()` — ensure the plumbing exists
- If the PR body already contains `Fixes #N` (e.g., from LLM generation), do NOT duplicate it
- Test the deduplication: mock LLM returning a body that already includes `Fixes #42`, verify no double reference
