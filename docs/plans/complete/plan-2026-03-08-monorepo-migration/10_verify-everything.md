# Chunk 10: Full Verification Pass

## Objective

Run a comprehensive verification of the entire monorepo migration: build all packages, run all tests, verify git history preservation, confirm workspace resolution, and check that no old gitlinks or root-level module dirs remain.

## Files

- No files created or modified — verification only

## Context

After chunks 01-09, the migration is structurally complete. This chunk is a gate — if anything fails, it must be fixed before proceeding to documentation and PR creation.

## Success Criteria

- [ ] `npx turbo run build` — all 11 packages build successfully
- [ ] `npx turbo run test` — all tests pass (should be 1,572+ across all modules)
- [ ] `npm ls @franken/types` — workspace resolution correct, no errors
- [ ] `git log --oneline packages/franken-types/ | wc -l` — shows 3+ commits
- [ ] `git log --oneline packages/franken-orchestrator/ | wc -l` — shows 108+ commits
- [ ] `git log --oneline packages/franken-brain/ | wc -l` — shows 39+ commits
- [ ] `git blame packages/franken-planner/src/core/dag.ts | head -5` — shows original commit hashes, not merge commits
- [ ] No gitlinks in index: `git ls-tree HEAD | grep 160000` returns empty
- [ ] No root-level module dirs: `ls -d franken-* 2>/dev/null` returns nothing
- [ ] No `.git` dirs inside packages: `ls packages/*/.git 2>/dev/null` returns nothing

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
echo "=== Build ===" && npx turbo run build 2>&1 | tail -3 && \
echo "=== Test ===" && npx turbo run test 2>&1 | tail -3 && \
echo "=== Workspace ===" && npm ls @franken/types 2>&1 | head -5 && \
echo "=== History ===" && \
echo "types: $(git log --oneline packages/franken-types/ | wc -l) commits" && \
echo "orchestrator: $(git log --oneline packages/franken-orchestrator/ | wc -l) commits" && \
echo "brain: $(git log --oneline packages/franken-brain/ | wc -l) commits" && \
echo "=== No gitlinks ===" && test -z "$(git ls-tree HEAD | grep 160000)" && echo "OK" && \
echo "=== No old dirs ===" && test -z "$(ls -d franken-* 2>/dev/null)" && echo "OK" && \
echo "=== No .git in packages ===" && test -z "$(ls -d packages/*/.git 2>/dev/null)" && echo "OK" && \
echo "ALL PASSED"
```

## Hardening Requirements

- If any verification fails, do NOT proceed — fix the issue first
- If test count is significantly lower than 1,572, investigate which modules lost tests
- If `git blame` shows only merge commits, the history rewrite in chunk 02 may have failed for that module
- This chunk produces NO commits — it's verification only
