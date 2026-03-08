# Chunk 05: Set Up npm Workspaces

## Objective

Add npm workspaces to the root `package.json`, convert all `file:../` cross-module dependencies to workspace `"*"` versions, and regenerate `package-lock.json`.

## Files

- **Modify**: `package.json` (root)
- **Modify**: `packages/franken-critique/package.json`
- **Modify**: `packages/franken-governor/package.json`
- **Modify**: `packages/franken-heartbeat/package.json`
- **Modify**: `packages/franken-orchestrator/package.json`
- **Modify**: `packages/franken-planner/package.json`

## Context

Cross-module dependency map (only modules with `file:` deps need updating):

| Module | Dependency | Current value |
|--------|-----------|---------------|
| franken-critique | @franken/types | `file:../franken-types` |
| franken-governor | @franken/types | `file:../franken-types` |
| franken-heartbeat | @franken/types | `file:../franken-types` |
| franken-orchestrator | @franken/types | `file:../franken-types` |
| franken-orchestrator | @frankenbeast/observer | `file:../franken-observer` |
| franken-planner | @franken/types | `file:../franken-types` |

All `file:../` values become `"*"` — npm workspaces resolves them to the local workspace package automatically.

## Success Criteria

- [ ] Root `package.json` has `"workspaces": ["packages/*"]`
- [ ] No `file:` dependencies remain in any `packages/*/package.json`
- [ ] `npm ls @franken/types` shows workspace links (not file: paths)
- [ ] `npm ls @frankenbeast/observer` shows workspace link for orchestrator
- [ ] `npm install` succeeds without errors
- [ ] `package-lock.json` regenerated with workspace resolution

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
grep -q '"workspaces"' package.json && echo "workspaces: OK" && \
! grep -r '"file:' packages/*/package.json && echo "no file: deps: OK" && \
npm ls @franken/types 2>&1 | head -5 && \
echo "ALL PASSED"
```

## Hardening Requirements

- Do NOT change `"name"` fields in any module `package.json` — workspace resolution depends on them matching import names
- Only change `file:../` deps to `"*"` — do not touch version numbers for npm registry deps
- Delete `node_modules/` in all packages AND root before running `npm install` to avoid stale symlinks
- Delete old `package-lock.json` before `npm install` — it references old `file:` paths
- The root `package.json` must keep `"private": true` (required for workspaces)
- Do NOT add `turbo` devDependency yet — that's the next chunk
- Root scripts should temporarily keep the old loop-based build/test commands — Turborepo replaces them in the next chunk
- Commit: `feat: adopt npm workspaces for monorepo package management`
