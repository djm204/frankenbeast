# Chunk 06: Add Turborepo

## Objective

Install Turborepo, create `turbo.json` with dependency-aware task definitions, update root `package.json` scripts to use `turbo run`, and add `.turbo/` to `.gitignore`.

## Files

- **Create**: `turbo.json`
- **Modify**: `package.json` (root — scripts + devDependency)
- **Modify**: `.gitignore`

## Context

The module dependency graph for build ordering:

```
franken-types (no deps — builds first)
├── franken-critique (depends on types)
├── franken-governor (depends on types)
├── franken-heartbeat (depends on types)
├── franken-planner (depends on types)
└── franken-orchestrator (depends on types + observer)

franken-brain (no @franken deps)
franken-mcp (no @franken deps)
franken-observer (no @franken deps) ← but orchestrator depends on it
franken-skills (no @franken deps)
frankenfirewall (no @franken deps)
```

Turborepo's `^build` (build dependencies first) handles this automatically.

Each module already has these scripts in their `package.json`:
- `build` — `tsc`
- `test` — `vitest run` (or should be — see franken-planner fix)
- `typecheck` — `tsc --noEmit`
- `lint` — `eslint .`

## Success Criteria

- [ ] `turbo.json` exists with `build`, `test`, `test:ci`, `typecheck`, `lint` tasks
- [ ] `turbo.json` `build` task has `"dependsOn": ["^build"]` and `"outputs": ["dist/**"]`
- [ ] Root `package.json` scripts use `turbo run` (no more shell `for` loops)
- [ ] `.gitignore` includes `.turbo`
- [ ] `npx turbo run build` succeeds — all 11 packages build in correct order
- [ ] `npx turbo run test` succeeds — all module tests pass
- [ ] `turbo` is in root `devDependencies`

## Verification Command

```bash
cd /home/pfk/dev/frankenbeast && \
test -f turbo.json && echo "turbo.json: OK" && \
grep -q '.turbo' .gitignore && echo ".gitignore: OK" && \
npx turbo run build --dry-run 2>&1 | tail -5 && \
npx turbo run build 2>&1 | tail -10 && \
npx turbo run test 2>&1 | tail -10 && \
echo "ALL PASSED"
```

## Hardening Requirements

- Root scripts to replace:
  - `"build"` → `"turbo run build"`
  - `"test"` → `"turbo run test"` (for all-modules test)
  - `"test:all"` → remove (redundant with turbo)
  - Keep `"test:root"` as `"vitest run"` for root-level integration tests
  - Keep `"test:root:watch"` as `"vitest"` for dev
  - `"typecheck"` → `"turbo run typecheck"`
- `turbo.json` `test` task should have `"dependsOn": ["build"]` (need built outputs for cross-module imports)
- `lint` task has NO dependencies — can run in parallel with everything
- Ensure every module that has a `test` script uses `vitest run` (NOT `vitest` which is watch mode). Check all 11 and fix any that use bare `vitest`.
- Commit: `feat: add Turborepo for build orchestration`
