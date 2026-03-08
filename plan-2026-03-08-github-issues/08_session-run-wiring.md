# Chunk 08: Session + Run Wiring

## Objective

Wire the `issues` subcommand into `session.ts` and `run.ts` so that `frankenbeast issues --label critical` fetches issues, triages, reviews, and executes the full pipeline. This is the integration chunk that connects all previous components.

## Files

- **Modify**: `franken-orchestrator/src/cli/run.ts` (add issues dispatch)
- **Modify**: `franken-orchestrator/src/cli/session.ts` (add `runIssues()` method)
- **Modify**: `franken-orchestrator/src/cli/dep-factory.ts` (wire issue deps)
- **Test**: `franken-orchestrator/tests/unit/cli/session-issues.test.ts`

## Success Criteria

- [ ] `resolvePhases()` in `run.ts` handles `subcommand === 'issues'`
- [ ] `main()` in `run.ts` dispatches to `session.runIssues()` when subcommand is `issues`
- [ ] `Session` class gets new `runIssues()` method
- [ ] `runIssues()` flow: `IssueFetcher.fetch()` → `IssueTriage.triage()` → `IssueReview.review()` → `IssueRunner.run()` → display summary
- [ ] `dep-factory.ts` extended: creates `IssueFetcher`, `IssueTriage`, `IssueGraphBuilder`, `IssueReview`, `IssueRunner` when subcommand is `issues`
- [ ] LLM completion function for triage/decomposition wired through `CliLlmAdapter` (existing adapter)
- [ ] Issue fetch options constructed from `CliArgs` issue flags
- [ ] `--dry-run` stops after review (does not execute)
- [ ] Final summary printed: table of outcomes (issue number, title, status, PR URL)
- [ ] Tests cover the happy path wiring with mocked deps
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/cli/session-issues.test.ts
```

## Hardening Requirements

- Follow the same dep-factory pattern as existing `createCliDeps()` — do NOT create a separate factory
- The `CliLlmAdapter` is already used for interview/plan LLM calls — reuse for triage/decomposition
- `runIssues()` should be a top-level session method, not nested inside `start()` phase loop
- The session should handle `IssueReview` returning `action: 'abort'` gracefully (log and exit, not throw)
- Budget from `CliArgs` must flow through to `IssueRunner`
- `--no-pr` flag must flow through to `IssueRunner.noPr`
- If `IssueFetcher.inferRepo()` fails, check for `--repo` flag before throwing
