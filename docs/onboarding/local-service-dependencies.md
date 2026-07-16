# Local service dependency explainer

Use this guide before telling a newcomer, PM, or worker to start every local service. Frankenbeast has a small core bootstrap path and several optional services. Most onboarding failures are faster to diagnose when the handoff says which service is actually required, how to verify it, and which failures are out of scope.

Structured source: `docs/onboarding/local-service-dependencies.manifest.json`.

## Fast decision table

| Capability being exercised | Local service dependency | Required? | Verification |
| --- | --- | --- | --- |
| Repository install, docs checks, root unit tests | None beyond Node.js and npm | No Docker required | `npm run bootstrap -- --no-docker`; `npm run test:root` |
| Semantic-memory seed and verification scripts | ChromaDB | Yes when using local semantic memory scripts | `curl -fsS http://localhost:8000/api/v2/heartbeat` |
| Local observability dashboards | Grafana | Yes for dashboard viewing only | `curl -fsS http://localhost:3000/api/health` |
| Distributed trace viewing/export smoke tests | Tempo | Yes for OTLP trace export | `curl -fsS http://localhost:3200/ready` |
| Local chat, Beast runs, dashboard chat turns | Provider CLI login or API-backed provider keys | Yes for real model calls | `command -v claude || command -v codex || command -v gemini`, or exported provider API key |
| Operator token and stored credentials | Configured secret backend | Yes when runtime resolves secret refs | `.fbeast/config.json` names the backend and required backend session/passphrase is available |

## Service details

### ChromaDB

- Start only when you are using semantic memory locally:

  ```bash
  docker compose up -d chromadb
  export CHROMA_URL=http://localhost:8000
  curl -fsS http://localhost:8000/api/v2/heartbeat
  ```

- Required for: `npm run local:seed`, `npm run local:verify-setup`, and semantic-memory verification that talks to ChromaDB.
- Not required for: repository install, root documentation tests, CLI help output, dashboard shell startup, or file-backed MCP memory tools.
- Failure symptom: memory seed/verification errors mention connection refused, an unavailable Chroma endpoint, or a missing v2 tenant/database API.

### Grafana

- Start only when you need the observability UI:

  ```bash
  GRAFANA_USER=admin GRAFANA_PASSWORD=<unique-password> docker compose up -d grafana
  curl -fsS http://localhost:3000/api/health
  ```

- Required for: local Grafana panels and operator-facing dashboard views.
- Not required for: trace collection itself, SQLite observer storage, root unit tests, or CLI planning/runs.
- Edge case: the old `admin/admin` default is intentionally rejected. Set a unique `GRAFANA_PASSWORD` before starting compose.

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

- Local chat, Beast runs, and dashboard chat need at least one real provider path. Install and authenticate a supported CLI (`claude`, `codex`, or `gemini`) or configure an API-backed provider with an exported key such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `GEMINI_API_KEY`.
- Not required for: docs-only tests, static typecheck, and most package unit tests.
- Failure symptom: provider resolution fails before a model call, or chat/Beast execution stops with missing provider credentials.

### Secret backend

- Choose the backend before the first init whenever possible:

  ```bash
  node packages/franken-orchestrator/dist/cli/run.js init
  ```

- Required for: stored operator tokens, stored provider credentials, and runtime paths that resolve secret refs.
- Not required for: repository bootstrap, docs-only checks, or tests that inject secrets directly.
- Health check: verify `.fbeast/config.json`, then prove the selected backend is usable: local encrypted vault plus `FRANKENBEAST_PASSPHRASE`, `BW_SESSION` for Bitwarden, an authenticated `op` CLI session for 1Password, or OS keychain availability.
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
