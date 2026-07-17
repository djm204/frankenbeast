# Persona quickstart tracks

Choose the track that matches your first job in the repository. Each track keeps the setup path narrow: run the prerequisites, setup commands, validation commands, and stop when the first-success signal appears. If a command fails, switch to the [setup troubleshooting matrix](setup-troubleshooting-matrix.md) before reading unrelated architecture docs.

## Persona chooser

| Persona | Use this track when | First-success outcome |
| --- | --- | --- |
| Operator | You want to run Frankenbeast locally, start optional services, or validate the dashboard/control-plane setup. | Bootstrap reaches the final onboarding badge and `local:verify-setup` reports the local configuration is usable. |
| Contributor | You want to install dependencies, inspect the workspace, make docs or code changes, and run a safe verification gate. | The repository builds or passes the targeted test path selected from the decision tree. |
| Agent-developer | You are a PM/worker/coding agent preparing one issue-scoped PR with GitHub and Codex review evidence. | Worker preflight emits JSON with `ok: true`, the issue worktree helper produces a branch/worktree plan, and the PR flow has a stable runbook target. |

## Operator track

### Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26` and the root `packageManager` npm pin.
- Docker only if you need ChromaDB, Grafana, or Tempo locally.
- A secret-backend choice before `frankenbeast init`: local encrypted file, OS keychain, 1Password, or Bitwarden.
- Provider credentials or local CLI providers only for the runtime path you plan to exercise.

### Setup commands

```bash
node --version && npm --version
npm run bootstrap -- --no-docker
${EDITOR:-vi} .env
```

Use Docker services only after setting non-default Grafana credentials:

```bash
npm run bootstrap -- --services
```

### Validation commands

```bash
npm run bootstrap:dry-run
npm run first-run:checklist -- --persona operator
```

If you intentionally started optional Docker services with `npm run bootstrap -- --services`, also run the live setup probe:

```bash
npm run local:verify-setup
```

### Expected success output

- Bootstrap prints `[onboarding:6/6:done] complete - onboarding bootstrap reached 6/6 steps`.
- `bootstrap:dry-run` exits `0` after validating the no-Docker prerequisite path without requiring ChromaDB, Grafana, or Tempo to be running.
- `local:verify-setup` exits `0` on the services path after validating the local `.env` and live optional-service setup state.
- The generated operator checklist includes runtime configuration and optional-service items without agent-only PR steps.

## Contributor track

### Prerequisites

- Node.js and npm versions accepted by the root `engines.node` and `packageManager` fields.
- A clean checkout or isolated worktree for your change.
- Familiarity with the current package map in `docs/RAMP_UP.md` before changing package boundaries.

### Setup commands

```bash
npm run bootstrap -- --no-docker
npm run first-run:checklist -- --persona contributor
npm run workspace:tour
```

### Validation commands

```bash
npm run build
npm run typecheck
npm test
```

For a narrower change, choose the smallest safe command from [the test command decision tree](test-command-decision-tree.md) before broadening to the full gates.

### Expected success output

- `first-run:checklist -- --persona contributor` prints a deterministic Markdown checklist that includes bootstrap, standard verification, and architecture-orientation items.
- `workspace:tour` prints the package responsibilities and safe first commands for the repository.
- The selected verification command exits `0`; if it does not, the failing package or test name is the next debugging target.

## Agent-developer track

### Prerequisites

- GitHub CLI authenticated for `djm204/frankenbeast` with write access before opening a PR.
- `git`, `gh`, and `jq` available on `PATH`.
- Git identity set to `David Mendez <me@davidmendez.dev>` in the issue worktree.
- One issue = one isolated branch/worktree = one PR; read `tasks/resolve-issues-shared-lessons.md` and `tasks/lessons.md` before editing.

### Setup commands

```bash
ISSUE_NUMBER="${ISSUE_NUMBER:?set the assigned issue number}"
ISSUE_TITLE="${ISSUE_TITLE:?set the assigned issue title}"
npm --silent run new-worker:preflight -- --json
npm run issue:worktree -- --dry-run --issue "$ISSUE_NUMBER" --title "$ISSUE_TITLE"
npm run first-run:checklist -- --persona coding-agent
```

When the dry run is correct, run the issue worktree helper without `--dry-run` or use the PM-provided worktree and branch.

### Validation commands

```bash
npm run test:root -- tests/docs-issue-1663.test.ts
npm run typecheck
npm run build
```

After the PR is opened, trigger and complete the real GitHub Codex gate described in [the coding-agent PR etiquette guide](coding-agent-pr-etiquette.md) and [the first-PR agent runbook](first-pr-agent-runbook.md).

### Expected success output

- `new-worker:preflight -- --json` returns JSON with `ok: true` and check entries for GitHub auth, git identity, repository root, and worktree cleanliness.
- `issue:worktree -- --dry-run` prints the planned issue number, branch, worktree path, duplicate-PR check, and verification commands without mutating the checkout.
- The docs regression test for this guide exits `0`, proving the entrypoint links and command references still match root package scripts and repository files.

## Drift guard

The root Vitest docs test `tests/docs-issue-1663.test.ts` intentionally reads this file, `README.md`, `ONBOARDING.md`, `docs/guides/quickstart.md`, and `package.json`. It fails if the required personas disappear, entrypoint links are removed, or npm-script commands in the tracks drift away from live root scripts.
