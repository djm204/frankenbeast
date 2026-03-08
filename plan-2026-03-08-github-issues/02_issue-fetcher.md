# Chunk 02: IssueFetcher Implementation

## Objective

Implement `IssueFetcher` that wraps `gh` CLI calls to fetch GitHub issues. Uses `child_process.execFile` to run `gh issue list` with filters and `gh repo view` to infer the repo.

## Files

- **Create**: `franken-orchestrator/src/issues/issue-fetcher.ts`
- **Modify**: `franken-orchestrator/src/issues/index.ts` (add export)
- **Test**: `franken-orchestrator/tests/unit/issues/issue-fetcher.test.ts`

## Success Criteria

- [ ] `IssueFetcher` class implements `IIssueFetcher`
- [ ] `fetch()` builds `gh issue list --json number,title,body,labels,state,url` command with filters
- [ ] `--label` filter: each label added as separate `--label <name>` flag
- [ ] `--milestone` filter: added as `--milestone <name>`
- [ ] `--search` filter: added as `--search <query>`
- [ ] `--assignee` filter: added as `--assignee <login>`
- [ ] `--limit` filter: added as `--limit <N>` (default 30)
- [ ] `--repo` filter: added as `--repo <owner/repo>` when provided
- [ ] `inferRepo()` runs `gh repo view --json nameWithOwner` and extracts the value
- [ ] `fetch()` parses JSON output, maps `labels` from `[{name: string}]` to `string[]`
- [ ] Throws descriptive error if `gh` command fails (not installed, not authed, network error)
- [ ] Throws descriptive error if fetch returns 0 results
- [ ] Constructor accepts optional `execFn` for testability (default: `child_process.execFile`)
- [ ] All tests pass using mocked `execFn`
- [ ] `npx tsc --noEmit` passes

## Verification Command

```bash
cd franken-orchestrator && npx tsc --noEmit && npx vitest run tests/unit/issues/issue-fetcher.test.ts
```

## Hardening Requirements

- Use `execFile` (not `exec`) to avoid shell injection — arguments are passed as an array
- Parse `gh` stderr for common error patterns: "gh auth login", "not a git repository", "HTTP 404"
- The `execFn` injection is for testing only — do NOT create an abstract interface for it
- Do NOT catch errors silently — always include the original stderr in thrown errors
- Labels from GitHub come as `[{name: "bug"}, {name: "critical"}]` — map to `["bug", "critical"]`
