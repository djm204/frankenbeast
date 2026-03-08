# Chunk 04: Remove Old Module Directories and Temp Clones

## Objective

Delete the old root-level module directories (which still contain independent `.git` repos) and clean up the temp clones at `/tmp/frankenbeast-migrate/`. After this chunk, the only module code lives under `packages/`.

## Files

- **Delete**: `franken-brain/`, `franken-critique/`, `franken-governor/`, `franken-heartbeat/`, `franken-mcp/`, `franken-observer/`, `franken-orchestrator/`, `franken-planner/`, `franken-skills/`, `franken-types/`, `frankenfirewall/` (root-level)
- **Delete**: `/tmp/frankenbeast-migrate/`

## Context

After chunk 03, the repo has BOTH:
- Old module directories at root (e.g., `franken-brain/` with `.git/` inside)
- New module directories under `packages/` (e.g., `packages/franken-brain/` — no `.git`)

The old ones are no longer tracked by git (gitlinks were removed). They need to be deleted. Since they contain `.git` directories, a simple `git add -A` won't catch them — use `rm -rf` directly.

## Success Criteria

- [ ] No root-level module directories exist (only `packages/`, `docs/`, `examples/`, etc.)
- [ ] `/tmp/frankenbeast-migrate/` is deleted
- [ ] `ls -d franken-* 2>/dev/null` returns nothing
- [ ] `ls -d frankenfirewall 2>/dev/null` returns nothing
- [ ] All module code is exclusively under `packages/`

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
test ! -d franken-brain && \
test ! -d franken-types && \
test ! -d frankenfirewall && \
test ! -d /tmp/frankenbeast-migrate && \
test -d packages/franken-brain && \
test -d packages/franken-types && \
test -d packages/frankenfirewall && \
echo "ALL PASSED"
```

## Hardening Requirements

- Use `rm -rf` for old module dirs since they contain `.git` directories
- Double-check `packages/<module>` exists BEFORE deleting the root-level `<module>/` — never delete without confirming the merge landed
- Commit after deletion — message: `chore: remove old root-level module directories`
- Do NOT delete `packages/` anything — only root-level module dirs
- Do NOT delete non-module root directories (docs/, examples/, .github/, etc.)
