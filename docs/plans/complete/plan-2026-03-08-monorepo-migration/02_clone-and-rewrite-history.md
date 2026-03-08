# Chunk 02: Clone Modules to Temp and Rewrite History

## Objective

Clone all 11 module repos to `/tmp/frankenbeast-migrate/` and run `git filter-repo --to-subdirectory-filter packages/<module>/` on each clone so their entire commit history is rewritten to place files under `packages/<module>/`.

## Files

- No project files modified — all work in `/tmp/frankenbeast-migrate/`

## Context

Each module at `/home/pfk/dev/frankenbeast/<module>` has its own `.git` directory. We clone from these local `.git` dirs (not GitHub) to get all local commits including unpushed ones.

Modules: `franken-brain`, `franken-critique`, `franken-governor`, `franken-heartbeat`, `franken-mcp`, `franken-observer`, `franken-orchestrator`, `franken-planner`, `franken-skills`, `franken-types`, `frankenfirewall`

## Success Criteria

- [ ] `/tmp/frankenbeast-migrate/` contains 11 cloned repos
- [ ] Each clone's `git ls-tree HEAD --name-only` shows only `packages/` as top-level directory
- [ ] Each clone's `git log --oneline` shows the original commits (not squashed)
- [ ] File contents under `packages/<module>/` match the originals exactly
- [ ] No `.git` corruption — `git fsck` passes on at least 2 sample clones

## Verification Command

```bash
for mod in franken-brain franken-critique franken-governor franken-heartbeat franken-mcp franken-observer franken-orchestrator franken-planner franken-skills franken-types frankenfirewall; do
  echo "=== $mod ==="
  cd /tmp/frankenbeast-migrate/$mod
  top=$(git ls-tree HEAD --name-only)
  if [ "$top" = "packages" ]; then echo "OK: rewritten"; else echo "FAIL: $top"; exit 1; fi
  count=$(git rev-list --count HEAD)
  echo "  commits: $count"
  cd /home/pfk/dev/frankenbeast
done && echo "ALL PASSED"
```

## Hardening Requirements

- Use `--force` flag with `git filter-repo` since the clones aren't "freshly cloned" by filter-repo's standards
- Clone from local `.git` dirs, NOT from GitHub URLs (to capture any unpushed local commits)
- Do NOT touch anything in `/home/pfk/dev/frankenbeast/` — only `/tmp/`
- If any module clone fails, stop and report — do not continue with partial state
