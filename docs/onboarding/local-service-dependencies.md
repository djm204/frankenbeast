# Local service dependency explainer

Use this guide before telling a newcomer, PM, or worker to start every local service. Frankenbeast has a small core bootstrap path and several optional services. Most onboarding failures are faster to diagnose when the handoff says which service is actually required, how to verify it, and which failures are out of scope.

Structured source: `docs/onboarding/local-service-dependencies.manifest.json`.

## Fast decision table

| Capability being exercised | Local service dependency | Required? | Verification |
| --- | --- | --- | --- |
| Repository install, docs checks, root unit tests | None beyond Node.js and npm | No Docker required | `npm run bootstrap -- --no-docker`; `npm run test:root` |
| Semantic-memory seed scripts | ChromaDB | Yes when using local semantic memory scripts | `curl -fsS "${CHROMA_URL:-http://localhost:8000}/api/v2/heartbeat"` |
| Local observability dashboards | Grafana | Yes for dashboard viewing only | `curl -fsS http://localhost:3000/api/health` |
| Distributed trace viewing/export smoke tests | Tempo | Yes for OTLP trace export | `curl -fsS http://localhost:3200/ready` |
| Local chat, agent execution, dashboard chat turns | CLI-backed provider login | Yes for chat surfaces that use the CLI registry | selected CLI-backed provider smoke call; do not rely on `command -v` alone |
| Explicit API-backed provider-registry integrations | API-backed provider keys or CLI-backed provider login | Yes for real model calls | selected provider smoke call using that provider path; do not treat normal `frankenbeast run` as API-key-only |
| Operator token and stored credentials | Configured secret backend | Yes when runtime resolves secret refs | `.fbeast/config.json` names the backend and a backend-specific decrypt/session check succeeds |

## Service details

### ChromaDB

- Start only when you are using semantic memory locally:

  ```bash
  set -a; [ ! -f .env ] || . ./.env; set +a
  docker compose up -d chromadb
  export CHROMA_URL=${CHROMA_URL:-http://localhost:8000}
  curl -fsS "$CHROMA_URL/api/v2/heartbeat"
  ```

- Required for: `npm run local:seed` and semantic-memory checks that talk directly to ChromaDB.
- Not required for: repository install, root documentation tests, CLI help output, dashboard shell startup, or file-backed MCP memory tools.
- Full-stack probe: `npm run local:verify-setup` checks ChromaDB, Grafana, and Tempo together; do not use it as a Chroma-only health check unless all optional services are intentionally running.
- Failure symptom: memory seed/verification errors mention connection refused, an unavailable Chroma endpoint, or a missing v2 tenant/database API.

### Grafana

- Start only when you need the observability UI:

  ```bash
  GRAFANA_USER=admin GRAFANA_PASSWORD="$(openssl rand -base64 24)" docker compose up -d --no-deps grafana
  curl -fsS http://localhost:3000/api/health
  ```

- Required for: local Grafana panels and operator-facing dashboard views.
- Not required for: trace collection itself, SQLite observer storage, root unit tests, or CLI planning/runs.
- Edge case: the old `admin/admin` default is intentionally rejected. Generate a unique `GRAFANA_PASSWORD` before starting compose, and use `--no-deps` when you want Grafana without also starting Tempo through Docker Compose dependencies.

### Tempo

- Start when you need local trace export or trace panels:

  ```bash
  docker compose up -d tempo
  curl -fsS http://localhost:3200/ready
  ```

- Required for: OTLP trace export smoke tests and Grafana trace exploration.
- Not required for: SQLite observer adapters, most package tests, or MCP initialization.
- Edge case: verify readiness on port `3200` and the OTLP/HTTP target on `4318` when debugging trace export.

### Provider CLI or API-backed providers

- Local chat, normal `frankenbeast run`/agent execution, and dashboard chat surfaces currently resolve providers through the CLI provider registry. Install and authenticate a supported CLI (`claude`, `codex`, or `gemini`) before expecting those paths to start.
- Only code paths that explicitly use API-backed provider-registry integrations may rely on an exported key such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY`; do not document API-key-only setup as sufficient for normal `frankenbeast run` or chat surfaces.
- Not required for: docs-only tests, static typecheck, and most package unit tests.
- Failure symptom: provider resolution fails before a model call, chat or normal `frankenbeast run` rejects API-only provider types such as `anthropic-api`, `openai-api`, or `gemini-api`, or an explicitly API-backed integration stops with missing provider credentials.

### Secret backend

- Choose the backend before the first init whenever possible:

  ```bash
  node packages/franken-orchestrator/dist/cli/run.js init
  ```

- Required for: stored operator tokens, stored provider credentials, and runtime paths that resolve secret refs.
- Not required for: repository bootstrap, docs-only checks, or tests that inject secrets directly.
- Health check: verify `.fbeast/config.json`, then prove the selected backend is usable: for `local-encrypted`, instantiate `LocalEncryptedStore` and run a decrypting call such as `keys()` with `FRANKENBEAST_PASSPHRASE`; for Bitwarden, require `BW_SESSION`, confirm `bw` is installed, and run a `bw list items --search frankenbeast` probe so stale sessions fail; for 1Password, require an authenticated `op` CLI session; for OS keychain, instantiate `OsKeychainStore`, run its platform detection, and fail when `secret-tool`/`security`/`cmdkey` is unavailable.
- Edge case: changing `network.secureBackend` does not migrate existing secret refs. Re-store or migrate secrets after switching between `local-encrypted`, `os-keychain`, `1password`, and `bitwarden`.

## Negative guidance

- Do not start the full Docker stack just because a docs test, static typecheck, or CLI help command failed.
- Do not assume Docker is required for onboarding. `npm run bootstrap -- --no-docker` is the default first-run path.
- Do not overwrite a remote service URL by starting a local container on the same port. If `CHROMA_URL` or another URL points away from localhost, verify that external dependency instead.
- Do not mark a PM/worker blocked on "local services" without naming the exact service id, health-check command, observed result, and capability being tested.

## PM/worker handoff template

```text
Local service dependency check:
- Capability under test:
- Required service id from docs/onboarding/local-service-dependencies.manifest.json:
- Start command needed, if local:
- Health check run and result:
- Env/config values verified:
- Not required services intentionally skipped:
- Next safe action:
```

For issue handoffs, point workers to this guide plus the JSON manifest instead of repeating prose. Automation should read the manifest when it needs stable service ids, commands, and edge-case handling.
