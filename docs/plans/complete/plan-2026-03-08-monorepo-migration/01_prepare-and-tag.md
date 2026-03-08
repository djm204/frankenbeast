# Chunk 01: Prepare Migration — Install Tools, Tag State

## Objective

Install `git-filter-repo`, tag the current state of all 11 module repos and the root repo for rollback safety, and create the migration branch.

## Files

- No code files created/modified

## Context

The root repo at `/home/pfk/dev/frankenbeast` tracks 11 module directories as gitlinks (mode `160000`) without `.gitmodules`. Each module has its own `.git` directory and GitHub remote using SSH format `git@github.com-djm204:djm204/<repo>.git`.

Modules: `franken-brain`, `franken-critique`, `franken-governor`, `franken-heartbeat`, `franken-mcp`, `franken-observer`, `franken-orchestrator`, `franken-planner`, `franken-skills`, `franken-types`, `frankenfirewall`

## Success Criteria

- [ ] `git filter-repo --version` succeeds
- [ ] All 11 module repos have `pre-monorepo-migration` tag pushed to origin
- [ ] Root repo has `pre-monorepo-migration` tag pushed to origin
- [ ] On branch `feat/monorepo-migration` based off `main`

## Verification Command

```bash
git filter-repo --version && \
git tag -l pre-monorepo-migration && \
git branch --show-current | grep feat/monorepo-migration
```

## Hardening Requirements

- Do NOT modify any code or config files in this chunk
- If `git filter-repo` is not available via pip, install via `sudo apt-get install git-filter-repo` or direct download
- Push tags to all remotes — these are the rollback points
- Make sure you're on `feat/monorepo-migration` branch before finishing
