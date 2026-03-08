# Chunk 10: E2E Integration Test

## Objective

Write an end-to-end integration test that proves the full `issues` pipeline works: fetch → triage → review (auto-approve) → execute → PR creation. All external deps (gh CLI, LLM, git) are mocked, but the flow runs through real Session/IssueRunner/IssueGraphBuilder wiring.

## Files

- **Create**: `franken-orchestrator/tests/integration/issues/issues-e2e.test.ts`
- **Modify**: (none — this is a read-only verification chunk)

## Success Criteria

- [ ] Test: `issues pipeline processes a one-shot issue end-to-end`
  - Mock `gh issue list` returning 1 issue with label `critical`
  - Mock LLM triage returning `one-shot`
  - Mock review auto-approving
  - Mock MartinLoop completing in 1 iteration with promise tag
  - Assert: `IssueOutcome` has `status: 'fixed'`
  - Assert: `PrCreator.create()` called with `Fixes #<N>` in body
- [ ] Test: `issues pipeline decomposes a chunked issue into multiple tasks`
  - Mock `gh issue list` returning 1 issue with label `high`
  - Mock LLM triage returning `chunked`
  - Mock LLM decomposition returning 2 chunks
  - Mock MartinLoop completing each chunk
  - Assert: 4 tasks executed (2 impl + 2 harden)
  - Assert: `IssueOutcome` has `status: 'fixed'`
- [ ] Test: `issues pipeline continues on individual issue failure`
  - Mock 2 issues: first fails (MartinLoop max iterations), second succeeds
  - Assert: outcomes are `['failed', 'fixed']`
  - Assert: second issue still gets a PR
- [ ] Test: `dry-run stops after triage review`
  - Assert: review displayed, no execution called
- [ ] All tests pass
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/integration/issues/issues-e2e.test.ts
```

## Hardening Requirements

- Mock at the boundary: `execFn` for gh CLI, completion function for LLM, `MartinLoop.run` for execution
- Do NOT mock internal classes (IssueGraphBuilder, IssueRunner) — let them run with real logic
- Each test should construct deps via `createCliDeps()` pattern (or minimal equivalent) to verify wiring
- Tests must not depend on network, filesystem state, or git repos
- Use `vi.fn()` for all mocks, assert with `toHaveBeenCalledWith()` for key interactions
