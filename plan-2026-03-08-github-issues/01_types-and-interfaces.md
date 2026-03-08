# Chunk 01: Issue Types + Interfaces

## Objective

Define all types for the GitHub issues pipeline: `GithubIssue`, `IssueFetchOptions`, `TriageResult`, `IssueOutcome`, and the `IIssueFetcher` / `IIssueTriage` port interfaces. No implementation yet — just the contracts.

## Files

- **Create**: `franken-orchestrator/src/issues/types.ts`
- **Test**: `franken-orchestrator/tests/unit/issues/types.test.ts`

## Success Criteria

- [ ] `GithubIssue` interface: `number`, `title`, `body`, `labels: string[]`, `state`, `url`
- [ ] `IssueFetchOptions` interface: `repo?`, `label?: string[]`, `milestone?`, `search?`, `assignee?`, `limit?` (default 30)
- [ ] `IssueComplexity` type: `'one-shot' | 'chunked'`
- [ ] `TriageResult` interface: `issueNumber`, `complexity: IssueComplexity`, `rationale`, `estimatedScope`
- [ ] `IssueOutcome` interface: `issueNumber`, `issueTitle`, `status: 'fixed' | 'failed' | 'skipped'`, `prUrl?`, `tokensUsed`, `error?`
- [ ] `IIssueFetcher` interface: `fetch(options: IssueFetchOptions): Promise<GithubIssue[]>`, `inferRepo(): Promise<string>`
- [ ] `IIssueTriage` interface: `triage(issues: GithubIssue[]): Promise<TriageResult[]>`
- [ ] Barrel export from `franken-orchestrator/src/issues/index.ts`
- [ ] Type-level tests (assignability checks) pass
- [ ] `npx tsc --noEmit` passes in `franken-orchestrator/`

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/issues/types.test.ts
```

## Hardening Requirements

- These are port interfaces — no implementation details, no `gh` CLI references
- `GithubIssue.labels` is `string[]` (label names only, not full GitHub label objects)
- `IssueFetchOptions.limit` defaults to 30 but the type should be `number | undefined`
- Do NOT add any implementation in this chunk — only types and interfaces
- Barrel `index.ts` re-exports everything from `types.ts`
