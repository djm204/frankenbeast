# Chunk 12: Create PR and Archive Old Repos

## Objective

Push the migration branch, create a PR linking to issue #16, and (after merge) archive all 11 individual module GitHub repos.

## Files

- No code files modified

## Context

The migration branch `feat/monorepo-migration` contains all the work from chunks 01-11. The PR should reference issue #16 and ADR-011.

GitHub repos to archive (after PR merge):
- `djm204/franken-brain`
- `djm204/franken-critique`
- `djm204/franken-governor`
- `djm204/franken-heartbeat`
- `djm204/franken-mcp`
- `djm204/franken-observer`
- `djm204/franken-orchestrator`
- `djm204/franken-planner`
- `djm204/franken-skills`
- `djm204/franken-types`
- `djm204/franken-firewall` (note: directory is `frankenfirewall` but repo is `franken-firewall`)

## Success Criteria

- [ ] Branch pushed to `origin/feat/monorepo-migration`
- [ ] PR created with title, body referencing #16 and ADR-011
- [ ] PR body includes test plan checklist

## Verification Command

```bash
gh pr view --json url,title,state 2>&1
```

## Hardening Requirements

- Push with `-u` flag to set upstream tracking
- PR body should include:
  - Summary of what changed
  - Reference to issue #16 (Closes #16)
  - Reference to ADR-011
  - Test plan checklist
- Do NOT archive repos in this chunk — that's a manual step AFTER the PR is merged and verified
- Add a note at the end of the PR body listing the 11 repos to archive post-merge
- Commit: none (PR creation only)
