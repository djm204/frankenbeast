# Chunk 11: Update Documentation

## Objective

Update `CLAUDE.md`, `docs/ARCHITECTURE.md`, and `docs/RAMP_UP.md` to reflect the monorepo layout, npm workspaces, and Turborepo. Remove references to gitlinks, submodules, and root-level module directories.

## Files

- **Modify**: `CLAUDE.md` (root)
- **Modify**: `docs/ARCHITECTURE.md`
- **Modify**: `docs/RAMP_UP.md`

## Context

Key changes to reflect:
- Modules now live under `packages/` (not root level)
- npm workspaces manage cross-module dependencies (no more `file:../` deps)
- Turborepo orchestrates builds/tests (`turbo run build`, not shell loops)
- No more gitlinks — single repo, single `git clone`
- ADR-011 supersedes ADR-001
- Individual module repos are archived on GitHub

Build commands changed:
- `npm run build` → runs `turbo run build` (builds all in dependency order)
- `npm test` → runs `turbo run test` (tests all modules in parallel)
- `npm run typecheck` → runs `turbo run typecheck`

## Success Criteria

- [ ] `CLAUDE.md` references `packages/` layout, not root-level modules
- [ ] `CLAUDE.md` mentions npm workspaces and Turborepo
- [ ] `docs/ARCHITECTURE.md` directory structure diagram uses `packages/` layout
- [ ] `docs/RAMP_UP.md` onboarding instructions use `turbo run` commands
- [ ] No references to gitlinks, `.gitmodules`, or "gitlink update" workflow remain in any doc
- [ ] ADR-011 is referenced where relevant
- [ ] `docs/RAMP_UP.md` stays under 5000 tokens

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
! grep -i gitlink CLAUDE.md docs/ARCHITECTURE.md docs/RAMP_UP.md && echo "No gitlink refs: OK" && \
grep -q 'packages/' CLAUDE.md && echo "CLAUDE.md updated: OK" && \
grep -q 'turbo' docs/RAMP_UP.md && echo "RAMP_UP.md updated: OK" && \
wc -w docs/RAMP_UP.md | awk '{if ($1 < 5000) print "RAMP_UP size: OK"; else { print "RAMP_UP too large: " $1; exit 1 }}' && \
echo "ALL PASSED"
```

## Hardening Requirements

- Read each doc file BEFORE modifying — understand existing content and structure
- Do NOT rewrite docs from scratch — update only what changed
- Keep `docs/RAMP_UP.md` concise and under 5000 tokens (user preference)
- Remove the "Gitlinks" and "Housekeeping - gitlink updates" sections if they exist
- Update any `cd franken-brain && npm test` style commands to `npx turbo run test --filter=franken-brain`
- Commit: `docs: update documentation for monorepo layout`
