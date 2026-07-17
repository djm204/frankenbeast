# Setup troubleshooting matrix

Use this matrix when a first-run setup, local bootstrap, or issue-worker preflight fails. Start with the symptom that matches the first failing command, collect the diagnostic evidence, apply the smallest safe remediation, then run the verification command before continuing.

Avoid destructive cleanup while diagnosing. Rows that mention generated state require a backup or a move to a timestamped quarantine path first. Copyable commands live below the table so Markdown table parsing cannot corrupt shell pipelines.

| Symptom | Likely cause | Diagnostic | Remediation | Verification |
| --- | --- | --- | --- | --- |
| `npm install`, `npm ci`, or `npm run bootstrap` fails with an engine error | Node.js does not satisfy the root `engines.node` range or `engine-strict=true` is rejecting the active runtime | D1 | Switch to a supported Node.js version from `.nvmrc` or the root `engines.node` range, then open a new shell so `node` and `npm` resolve to the same toolchain | V1 |
| `npm run check:package-manager` reports a package-manager mismatch | Corepack is disabled, the npm shim is stale, or a different package manager is active | D2 | Enable Corepack for npm and activate the exact pinned package manager | V2 |
| `corepack: command not found` before bootstrap | The installed Node.js distribution does not bundle Corepack or it was not installed on PATH | D3 | Install Corepack for the active Node.js runtime, then run the repository Corepack activation commands from `ONBOARDING.md` | V3 |
| `gh auth status` fails during `new-worker:preflight`, issue worktree bootstrap, or PR creation | GitHub CLI is not installed, is not logged in, or is logged in without repository write access | D4 | Install/log in with `gh auth login` using an account that can read the repository and, for PR-producing work, write branches/comments | V4 |
| Bootstrap or a dev server reports `EADDRINUSE` or a dashboard/chat port is already in use | A prior local server, dashboard, chat backend, or test process is still listening on the configured port | D5 | Stop the owning process from the previous terminal/session, or choose an explicit unused port for the new server; do not kill unrelated system processes without confirming the owner | V5 |
| `new-worker:preflight` reports a dirty worktree before coding | Generated files, previous worker edits, or scratch artifacts are present in the issue checkout | D6 | Use a fresh isolated worktree for the issue. If generated artifacts must be removed, first move them to a timestamped backup/quarantine directory outside the worktree or confirm they are ignored scratch files | V6 |
| Bootstrap or runtime commands fail on `.fbeast/*.lock`, SQLite busy, or stale lock-file errors | A prior process exited while holding a generated lock or a live Frankenbeast process is still using local state | D7 | First stop live Frankenbeast processes cleanly. For checkpoint locks, run the `detectCheckpointLock(checkpointPath)` workflow in `docs/runbooks/checkpoint-locks.md` and only move/remove a lock when `safeToRemove` is true; otherwise include the detector status, owner PID, and unlock hint in the handoff | V7 |
| `npm --silent run new-worker:preflight -- --json` returns failed checks | Required tools, git identity, GitHub auth, repository root, or worktree cleanliness does not match issue-worker expectations | D8 | Fix each `fail` check directly: install missing `git`/`gh`/`jq`, log in to GitHub, set `git config user.name 'David Mendez'` and `git config user.email 'me@davidmendez.dev'`, or move to a clean issue worktree | V8 |
| Docker-backed optional services fail during `npm run bootstrap -- --services` | Docker is not running, credentials are missing, or optional ChromaDB/Grafana/Tempo containers are unhealthy | D9 | Start Docker, set required local service env such as a unique `GRAFANA_PASSWORD`, and restart the required optional service set. Unit tests and most docs changes can continue with `--no-docker` | V9 |
| Provider, dashboard, or chat setup fails with missing token/secret errors | Runtime environment and configured `network.secureBackend` do not contain the same operator/provider secrets | D10 | Choose the secret backend before init, authenticate that backend (`op`, `bw`, OS keychain, or local encrypted passphrase), then re-store or migrate existing secret refs when changing backends | V10 |

## Diagnostic and verification commands

### D1 / V1: Node engine

```bash
node --version
node -p "require('./package.json').engines.node"
node -p "process.version" && npm --version && npm run check:package-manager
```

### D2 / V2: package manager and Corepack

```bash
node -p "require('./package.json').packageManager"
npm --version
command -v corepack
corepack enable npm
corepack prepare "$(node -p "require('./package.json').packageManager")" --activate
npm --version && npm run check:package-manager
```

### D3 / V3: missing Corepack

```bash
node --version
command -v corepack || true
npm install -g corepack
command -v corepack && corepack --version
corepack enable npm
corepack prepare "$(node -p "require('./package.json').packageManager")" --activate
npm --version && npm run check:package-manager
```

### D4 / V4: GitHub CLI access

```bash
command -v gh
gh auth status
gh repo view djm204/frankenbeast --json viewerPermission
```

### D5 / V5: default onboarding ports

Checks both default local ports, `5173 3737`, and exits non-zero if any checked port is occupied. Set `FAILED_PORTS=<failed-port>` to probe only the port named in the failure.

```bash
failed=0
for port in ${FAILED_PORTS:-5173 3737}; do
  PORT="$port" node -e "const port=Number(process.env.PORT); import('node:net').then(({createServer}) => { const s=createServer().once('error', e => { console.error(port + ': ' + e.code); process.exit(1); }).once('listening', () => s.close(() => console.log(port + ': free'))).listen(port, '127.0.0.1'); })" || failed=1
done
exit "$failed"
```

### D6 / V6: worktree cleanliness

```bash
git status --short --branch
git diff --stat
```

### D7 / V7: checkpoint and generated-state locks

```bash
pgrep -af '[f]rankenbeast|[f]beast|node .*[f]ranken' || true
find .fbeast -maxdepth 2 -type f -name '*.lock' -print
sed -n '1,80p' docs/runbooks/checkpoint-locks.md
```

For checkpoint locks, do not rely on process-name checks alone. Use the `detectCheckpointLock(checkpointPath)` detector from `docs/runbooks/checkpoint-locks.md`; only move or remove a lock after the detector reports `safeToRemove: true`. Verify recovery by rerunning the lock detector and the originally failed command, not by running the full `npm run local:verify-setup` service probe unless the original failure was a full local stack verification.

### D8 / V8: issue-worker preflight

```bash
npm --silent run new-worker:preflight -- --json
```

### D9 / V9: optional Docker services

```bash
docker compose ps
docker compose logs --tail=80 chromadb grafana tempo
```

For the full optional stack, run:

```bash
docker compose ps && npm run local:verify-setup
```

For partial stacks, use only the targeted probe for the service you started:

```bash
set -a
[ ! -f .env ] || . ./.env
set +a

# ChromaDB only:
curl -fsS "${CHROMA_URL:-http://localhost:8000}/api/v2/heartbeat"

# Grafana only:
curl -fsS http://localhost:3000/api/health

# Tempo only:
curl -fsS http://localhost:3200/ready
```

### D10 / V10: secret backend and credential refs

Inventory configured refs without printing secret values:

```bash
npm run build --workspace @franken/orchestrator
node packages/franken-orchestrator/dist/cli/run.js init --help
test -f .fbeast/config.json && node -e "console.log(JSON.parse(require('node:fs').readFileSync('.fbeast/config.json','utf8')).network?.secureBackend)"
frankenbeast network credentials || node packages/franken-orchestrator/dist/cli/run.js network credentials
```

Then verify by resolving through the selected backend or rerunning the originally failed provider/dashboard/chat command. `frankenbeast network credentials` is an inventory check, not a proof that the backend can decrypt or resolve the secret. Run `init --repair` only when you intentionally want an interactive repair that may update local state.

## Evidence bundle for handoffs

When escalating a setup failure to a PM, maintainer, or follow-up agent, include:

- the exact failed command and full error text;
- output from `node --version`, `npm --version`, `npm run check:package-manager`, and `npm --silent run new-worker:preflight -- --json` when relevant;
- `git status --short --branch` from the failing checkout;
- the selected optional-service mode (`--no-docker` or `--services`) and `docker compose ps` output when Docker services are involved;
- confirmation that any generated-state cleanup was backed up or quarantined before retrying.
