# Chunk 05: HITL Triage Review

## Objective

Implement the interactive review step that presents the triage plan to the user and lets them approve, remove issues, or abort before execution begins.

## Files

- **Create**: `franken-orchestrator/src/issues/issue-review.ts`
- **Modify**: `franken-orchestrator/src/issues/index.ts` (add export)
- **Test**: `franken-orchestrator/tests/unit/issues/issue-review.test.ts`

## Success Criteria

- [ ] `IssueReview` class with `review(issues: GithubIssue[], triage: TriageResult[]): Promise<ReviewDecision>` method
- [ ] `ReviewDecision` type: `{ approved: TriageResult[], action: 'execute' | 'abort' }`
- [ ] Displays table: issue number, title (truncated to 50 chars), severity label, complexity, rationale
- [ ] Severity extracted from labels (first match of: critical, high, medium, low)
- [ ] Sort order: critical → high → medium → low → unlabelled, then by issue number
- [ ] Prompt: `"Approve all? [Y/n/edit] "`
- [ ] `Y` or empty → approve all
- [ ] `n` → abort (returns `action: 'abort'`)
- [ ] `edit` → prompt for issue numbers to remove (comma-separated), then re-display and re-confirm
- [ ] Constructor accepts IO interface `{ read(): Promise<string>, write(text: string): void }` for testability
- [ ] All tests pass
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/issues/issue-review.test.ts
```

## Hardening Requirements

- Use the same IO pattern as `InterviewLoop` in `franken-orchestrator/src/planning/interview-loop.ts` for stdin/stdout abstraction
- Table rendering: use simple aligned columns (no external table library)
- Title truncation: add `...` suffix when truncated
- If user enters invalid issue numbers during edit, warn and re-prompt (don't crash)
- `--dry-run` mode should display the table and exit without prompting (always returns `action: 'abort'`)
- Do NOT import readline directly — use the injected IO interface
