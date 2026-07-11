# Workspace lint coverage

The root lint gate is `npm run lint`. It first runs `scripts/check-workspace-lint-coverage.mjs` so new workspaces cannot silently miss lint coverage, then runs `turbo run lint` across every workspace that declares the task.

Every maintained `packages/*` workspace must have:

1. a package-local `scripts.lint` entry,
2. an ESLint flat config in the package directory, and
3. a row in the table below describing the lint posture.

Do not add a new workspace without updating this file and the package's lint script/config. If a future workspace is intentionally excluded from ESLint, document the reason here and update `scripts/check-workspace-lint-coverage.mjs` to recognize that explicit exclusion rather than relying on Turbo to skip it silently.

| Workspace | Path | Lint posture |
| --- | --- | --- |
| `@franken/brain` | `packages/franken-brain` | Existing package ESLint config; `npm run lint --workspace @franken/brain` checks `src/` and `tests/`. |
| `@franken/critique` | `packages/franken-critique` | Existing package ESLint config; `npm run lint --workspace @franken/critique` checks `src/` and `tests/`. |
| `@franken/governor` | `packages/franken-governor` | Shared workspace ESLint config; `npm run lint --workspace @franken/governor` checks `src/` and `tests/`. |
| `@franken/mcp-suite` | `packages/franken-mcp-suite` | Shared workspace ESLint config; `npm run lint --workspace @franken/mcp-suite` checks `src/`, including colocated tests. |
| `@franken/observer` | `packages/franken-observer` | Shared workspace ESLint config; `npm run lint --workspace @franken/observer` checks `src/` and `tests/`. |
| `@franken/orchestrator` | `packages/franken-orchestrator` | Existing package ESLint config; `npm run lint --workspace @franken/orchestrator` checks `src/` and `tests/`. |
| `@franken/planner` | `packages/franken-planner` | Existing package ESLint config; `npm run lint --workspace @franken/planner` checks the package. |
| `@franken/types` | `packages/franken-types` | Shared workspace ESLint config; `npm run lint --workspace @franken/types` checks `src/` and `tests/`. |
| `@franken/web` | `packages/franken-web` | Shared workspace ESLint config with TSX parsing; `npm run lint --workspace @franken/web` checks `src/` and `tests/`. |
| `@franken/live-bench` | `packages/live-bench` | Shared workspace ESLint config; `npm run lint --workspace @franken/live-bench` checks `src/` and `tests/`. |
