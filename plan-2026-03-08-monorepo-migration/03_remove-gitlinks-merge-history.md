# Chunk 03: Remove Gitlinks and Merge All Module Histories

## Objective

Remove all 11 gitlink entries from the root repo's git index, then merge each rewritten module history from `/tmp/frankenbeast-migrate/` into the root repo using `git merge --allow-unrelated-histories`. After this chunk, `packages/` contains all 11 modules with their full git history.

## Files

- **Modify**: Root git index (remove gitlinks)
- **Create**: `packages/` directory (populated by merges)

## Context

Chunk 02 created rewritten clones at `/tmp/frankenbeast-migrate/<module>` where all files live under `packages/<module>/`. The root repo currently has gitlinks (mode `160000`) for all 11 modules. We must:

1. Remove gitlinks from the index (`git rm --cached`)
2. Merge each rewritten history into the root repo

The old module directories with their `.git` dirs still exist on disk after `git rm --cached` — that's fine, they'll be cleaned up in a later chunk.

Modules in merge order: `franken-types` first (dependency root), then alphabetical for the rest: `franken-brain`, `franken-critique`, `franken-governor`, `franken-heartbeat`, `franken-mcp`, `franken-observer`, `franken-orchestrator`, `franken-planner`, `franken-skills`, `frankenfirewall`

## Success Criteria

- [ ] No gitlink entries remain in git index (`git ls-tree HEAD | grep 160000` returns empty)
- [ ] `packages/` contains all 11 module directories with source code
- [ ] `git log --oneline packages/franken-types/ | wc -l` shows original commit count (3+)
- [ ] `git log --oneline packages/franken-orchestrator/ | wc -l` shows original commit count (108+)
- [ ] `git log --oneline packages/franken-brain/ | wc -l` shows original commit count (39+)
- [ ] No merge conflicts during any of the 11 merges (they touch disjoint paths)

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
test -z "$(git ls-tree HEAD | grep 160000)" && echo "No gitlinks: OK" && \
test -d packages/franken-types && echo "types: OK" && \
test -d packages/franken-orchestrator && echo "orchestrator: OK" && \
test -d packages/frankenfirewall && echo "firewall: OK" && \
echo "types commits: $(git log --oneline packages/franken-types/ | wc -l)" && \
echo "orchestrator commits: $(git log --oneline packages/franken-orchestrator/ | wc -l)" && \
echo "ALL PASSED"
```

## Hardening Requirements

- Use `git rm --cached <module>` (not `git rm`) — we need the directories to stay on disk until cleanup
- Commit the gitlink removal BEFORE starting merges
- Merge `franken-types` FIRST since other modules depend on it
- Each merge must use `--allow-unrelated-histories` flag
- Each merge commit message should be: `merge: absorb <module> history into monorepo (packages/<module>/)`
- If ANY merge fails, stop immediately — do not continue with partial merges
- Do NOT delete the old root-level module directories yet — that's a later chunk
