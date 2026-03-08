# Chunk 06: IssueRunner — Outer Loop Orchestrator

## Objective

Implement `IssueRunner` that iterates approved issues in priority order, builds a `PlanGraph` per issue, executes via `CliSkillExecutor`, and calls `PrCreator` per issue. Handles failures gracefully — logs and continues to the next issue.

## Files

- **Create**: `franken-orchestrator/src/issues/issue-runner.ts`
- **Modify**: `franken-orchestrator/src/issues/index.ts` (add export)
- **Test**: `franken-orchestrator/tests/unit/issues/issue-runner.test.ts`

## Success Criteria

- [ ] `IssueRunner` class with `run(config: IssueRunnerConfig): Promise<IssueOutcome[]>`
- [ ] `IssueRunnerConfig` interface: `issues`, `triageResults`, `graphBuilder: IssueGraphBuilder`, `executor: CliSkillExecutor`, `git: GitBranchIsolator`, `prCreator?: PrCreator`, `checkpoint?: ICheckpointStore`, `logger?: ILogger`, `budget: number`, `baseBranch: string`, `noPr: boolean`, `repo: string`
- [ ] Iterates issues in severity-priority order (critical → high → medium → low)
- [ ] Per issue: calls `graphBuilder.buildForIssue()`, then executes each task via `executor.execute()`
- [ ] Branch per issue: `fix/issue-<N>` via `git.isolate()`
- [ ] On all tasks success + `!noPr`: calls `prCreator.create()` with `Fixes #<N>` in body
- [ ] On task failure: records `IssueOutcome` with `status: 'failed'`, continues to next issue
- [ ] On budget exceeded: stops iteration, records remaining issues as `status: 'skipped'`
- [ ] Checkpoint integration: skips issues where all tasks already checkpointed
- [ ] Returns `IssueOutcome[]` with results for all issues
- [ ] Logs progress with `[issues]` service label: `"[issues] Starting issue #42 (1/5)"`, `"[issues] Issue #42 fixed, PR: <url>"`
- [ ] All tests pass with fully mocked deps
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/issues/issue-runner.test.ts
```

## Hardening Requirements

- Do NOT re-implement execution logic — delegate to `CliSkillExecutor.execute()` for each task
- Do NOT merge branches inside IssueRunner — `CliSkillExecutor` already handles branch isolation and merge
- Budget check: track cumulative `tokensUsed` across issues, compare against `budget` converted to tokens
- The `prCreator.create()` call needs the issue number to add `Fixes #N` — pass via a new optional field or append to the PR body directly
- On `PrCreator` failure (gh not authed, network error): log warning, record outcome without prUrl, continue
- Severity extraction from labels: look for first match of `critical`, `high`, `medium`, `low` (case-insensitive)
- If no severity label found, sort to end (lowest priority)
