# ADR-011: Migrate to Real Monorepo with npm Workspaces + Turborepo

## Status
Accepted — supersedes ADR-001

## Context
The root repo tracks 11 module directories as gitlinks (mode `160000`) without a `.gitmodules` file. This is neither a valid submodule setup nor a standard monorepo:

- `git submodule status` fails (`fatal: no submodule mapping found`)
- Fresh clones cannot reconstruct the project layout
- Cross-module dependencies already use `file:../` paths (monorepo-style)
- Build/test scripts loop through directories with shell `for` loops
- The project has grown to 11 modules, ~29K lines of TS, and 1,572 tests

The repo behaves like a monorepo in every way except Git storage.

## Decision
Convert to a real monorepo:

1. **Merge module git histories** into the root repo using subtree merges (`git merge --allow-unrelated-histories`) to preserve blame and log
2. **Move modules to `packages/`** — `packages/franken-brain/`, `packages/franken-types/`, etc.
3. **Adopt npm workspaces** — `"workspaces": ["packages/*"]` in root `package.json`; replace `file:../` deps with workspace-resolved `"*"` versions
4. **Add Turborepo** for build orchestration — `^build` dependency graph handles build order, parallelism, and caching automatically
5. **Archive individual GitHub repos** — mark as read-only on GitHub; all future work happens in the monorepo

## Alternatives Considered

### Keep gitlinks, add `.gitmodules`
Would make `git submodule` work but fights the actual development workflow. Every cross-module change requires coordinated commits across repos plus gitlink updates — friction the team already works around daily.

### npm workspaces without Turborepo
Lower setup cost but loses dependency-aware task execution. With 11 modules that have a build dependency graph (types → most modules → orchestrator), manual ordering is error-prone. Turborepo can be added later, but the migration is the right time to adopt it.

### pnpm workspaces
Stricter hoisting and faster installs, but the project already uses npm + `package-lock.json`. Migration cost isn't justified by the benefits at current scale.

## Consequences
- **Supersedes ADR-001**: "No build tool overhead" is no longer the right trade-off at 11 modules
- Fresh clones work with a single `git clone` + `npm install`
- `turbo run build test lint` replaces shell loops
- `git blame` and `git log --follow` work across module history
- Individual module repos become read-only archives
- CI simplifies to Turborepo commands with automatic parallelism and caching
- `file:../` dependencies disappear — npm workspaces handles resolution
