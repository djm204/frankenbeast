# Design: Migrate to Real Monorepo

**Date**: 2026-03-08
**ADR**: 011-real-monorepo-migration
**Issue**: #16

## Problem

The root repo tracks 11 module directories as gitlinks without `.gitmodules`. This breaks `git submodule status`, prevents fresh clones from working, and forces manual gitlink coordination after every submodule commit. The project already behaves like a monorepo — the Git storage model is the inconsistent part.

## Decisions

| Decision | Choice |
|----------|--------|
| History | Merge each module's full git history into root repo |
| Package management | npm workspaces + Turborepo |
| Directory layout | Move modules under `packages/` |
| Old repos | Archive on GitHub after migration |

## Target Layout

```
frankenbeast/
├── packages/
│   ├── franken-brain/
│   ├── franken-critique/
│   ├── franken-governor/
│   ├── franken-heartbeat/
│   ├── franken-mcp/
│   ├── franken-observer/
│   ├── franken-orchestrator/
│   ├── franken-planner/
│   ├── franken-skills/
│   ├── franken-types/
│   └── frankenfirewall/
├── docs/
├── examples/
├── turbo.json
├── package.json
└── package-lock.json
```

## History Merge Strategy

For each of the 11 modules:

1. Add module's local `.git` as a named remote (e.g., `franken-brain-local`)
2. Fetch its history
3. Merge with `--allow-unrelated-histories` using the subtree merge strategy, placing files under `packages/<module>/`
4. Remove the temporary remote
5. Delete the module's `.git` directory

This preserves `git log --follow` and `git blame` for all module files.

## npm Workspaces

Root `package.json`:
```json
{
  "workspaces": ["packages/*"]
}
```

Each module's cross-module deps change from `file:` paths to workspace versions:
```diff
- "@franken/types": "file:../franken-types"
+ "@franken/types": "*"
```

npm resolves `"*"` to the local workspace package automatically.

## Turborepo

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- `^build` = build transitive dependencies first
- Handles build order automatically: `franken-types` → consumers → `franken-orchestrator`
- Caches outputs — rebuilds only what changed

Root scripts become:
```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint"
  }
}
```

## CI Updates

- Replace shell-loop build/test scripts with `turbo run build test lint`
- Turborepo's dependency graph handles ordering and parallelism
- Add `.turbo/` to `.gitignore`
- Update any `release-please` configs that reference individual module repos

## Dependency Graph

```
franken-types
├── franken-brain (no @franken deps, but uses types at dev time)
├── franken-critique
├── franken-governor
├── franken-heartbeat
├── franken-mcp
├── franken-observer
├── franken-planner
├── franken-skills
└── frankenfirewall

franken-observer
└── franken-orchestrator (depends on types + observer)
```

## Cleanup Checklist

- [ ] Remove `.git/` directories from all `packages/*/`
- [ ] Remove gitlink entries from root git index
- [ ] Update all `tsconfig.json` paths if needed
- [ ] Update `file:` dependencies to workspace `"*"` versions
- [ ] Update `.github/workflows/` to use Turborepo
- [ ] Update `CLAUDE.md`, `ARCHITECTURE.md`, `RAMP_UP.md`
- [ ] Archive 11 individual GitHub repos via `gh repo archive`
- [ ] Update `release-please` configuration for monorepo layout

## Risk Mitigation

- **Backup**: Tag current state in all repos before starting
- **Atomic**: Do the full migration on a feature branch, verify all 1,572 tests pass before merging
- **Reversible**: Archived repos can be unarchived if needed
