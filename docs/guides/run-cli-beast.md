# Running the CLI Beast Harness

The beast harness is split across two CLIs. This guide covers both.

| CLI | Package | Role |
|-----|---------|------|
| `fbeast` | `@franken/mcp-suite` | MCP server registration, beast-mode activation shim |
| `frankenbeast` / `franken` / `frkn` | `@franken/orchestrator` | The actual beast loop — interview, plan, execute |

---

## Prerequisites

- Node.js `>=22.13.0 <23 || >=24.0.0 <26`
- Corepack-enabled npm matching the root `packageManager` pin (`npm@11.5.1`)
- For API-backed `frankenbeast` provider registry runs, an API key for at least one supported provider: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or either `GOOGLE_API_KEY` / `GEMINI_API_KEY` for `gemini-api`
- For `fbeast mcp beast` preset activation, one of the supported Beast provider paths: `anthropic-api` with `ANTHROPIC_API_KEY`, or an installed/logged-in `claude` / `codex` CLI for `claude-cli` / `codex-cli`

```bash
cp .env.example .env
# For API-backed runs, set ANTHROPIC_API_KEY, OPENAI_API_KEY,
# or GOOGLE_API_KEY / GEMINI_API_KEY.
# For fbeast mcp beast --provider=anthropic-api, set ANTHROPIC_API_KEY.
```

### Ollama endpoint variable status

`OLLAMA_BASE_URL` is a legacy/forward-looking endpoint variable, not a currently supported local setup requirement. The current orchestrator provider config accepts `claude-cli`, `codex-cli`, `gemini-cli`, `anthropic-api`, `openai-api`, and `gemini-api`, and the `fbeast mcp beast --provider=...` activation shim accepts only the Beast presets documented below. Setting `OLLAMA_BASE_URL` alone will not enable an Ollama-backed run in this build.

If an Ollama-compatible provider is added back in a future build or a custom fork, the usual local daemon endpoint would be:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
```

For a non-default daemon in such a build, the value would point at that endpoint instead, for example:

```bash
export OLLAMA_BASE_URL=http://ollama.internal:11434
```

The root `.env.example` intentionally leaves `OLLAMA_BASE_URL` out because the default local setup, the current provider schema, and the current `fbeast mcp beast` presets do not consume it.

Endpoint-only verification, useful only when you are working with a build that actually supports an Ollama-compatible provider:

```bash
curl "$OLLAMA_BASE_URL/api/tags"
```

---

## 1. Install and link the CLIs

From the repo root:

```bash
npm install
npm run local:link
```

`local:link` is the supported local-checkout path. It builds the repo and links the package-name workspaces declared in `package.json`, so you do not need to run path-style `npm link --workspace=packages/...` commands manually.

Verify:
```bash
npm run local:verify-cli
```

---

## 2. Register MCP servers (`fbeast mcp init`)

Run once per project directory:

```bash
fbeast mcp init                          # standard — 7 individual servers
fbeast mcp init --mode=proxy             # proxy — 1 server, 2 meta-tools (lower context cost)
fbeast mcp init --hooks                  # also install pre/post-tool hooks
fbeast mcp init --client=gemini          # target Gemini CLI instead of Claude Code (auto-detected)
fbeast mcp init --client=codex           # target Codex CLI
```

This writes MCP entries into your client config (`~/.claude/settings.json`, `~/.gemini/settings.json`, etc.) and creates `.fbeast/beast.db`.

`fbeast mcp init` and `fbeast mcp beast` operate on the current working directory. Run them from the target project checkout rather than relying on `FBEAST_ROOT`.

---

## 3. Activate beast mode (`fbeast mcp beast`)

```bash
fbeast mcp beast                                    # default provider: anthropic-api
fbeast mcp beast --provider=anthropic-api           # Claude via API key
fbeast mcp beast --provider=codex-cli              # Codex (requires Codex CLI installed)
fbeast mcp beast --provider=claude-cli             # Claude CLI binary (prompts for risk acknowledgement)
```

This writes `.fbeast/config.json` with `mode: "beast"` and prints the beast catalog. The `claude-cli` provider spawns subprocesses outside the API billing path and asks for one-time confirmation.

The `fbeast mcp beast` activation shim currently accepts only the provider values shown above. Provider registry entries such as `openai-api`, `gemini-api`, or `gemini-cli` can still be used by `frankenbeast` runs, but they are not `fbeast mcp beast --provider` presets unless the shim adds explicit support for them.

---

## 4. The beast loop: interview → plan → run

### Option A — Full interactive flow

```bash
frankenbeast
```

No arguments starts the interview. The beast asks about your objective and constraints, produces a design doc, decomposes it into a chunk plan, then executes.

### Option B — Start from a design doc

```bash
frankenbeast plan --design-doc path/to/design.md
```

Skips the interview and goes straight to chunk decomposition.

### Option C — Execute an existing chunk plan

```bash
frankenbeast run --plan-dir .fbeast/plans/my-plan/chunks
```

Skips interview and planning, executes existing chunks.

### Option D — Run individual phases

```bash
frankenbeast interview                                # interview only, saves design doc
frankenbeast plan --design-doc design.md              # planning only, saves chunks
frankenbeast run                                      # execute chunks from .fbeast/
```

When a wrapper or service manager starts `frankenbeast` from outside the target project, pass `--base-dir /absolute/path/to/project` for CLI-managed roots. See the README's [Beast project-root override](../../README.md#beast-project-root-override) for the narrower `FBEAST_ROOT` fallback used by Beast service construction and built-in run configs when no explicit root is supplied.

---

## 5. Beast dispatch system

Beasts are named process-level runs managed by the dispatcher.

```bash
# See available Beast definitions
frankenbeast beasts catalog

# Spawn a Beast interactively
frankenbeast beasts spawn martin-loop
frankenbeast beasts spawn design-interview
frankenbeast beasts spawn chunk-plan

# Manage running Beasts
frankenbeast beasts list
frankenbeast beasts status <run-id>
frankenbeast beasts logs <run-id>
frankenbeast beasts stop <run-id>
frankenbeast beasts kill <run-id>
frankenbeast beasts restart <run-id>

# Manage tracked dashboard agents
frankenbeast beasts resume <agent-id>
frankenbeast beasts delete <agent-id>
```

`resume` and `delete` operate on tracked agent IDs, not run IDs. Use `resume` to continue the agent's linked run and `delete` to soft-delete the tracked agent.

Available catalog entries: `design-interview`, `chunk-plan`, `martin-loop`.

### Execution isolation

Beast dispatch supports two execution modes:

| Mode | Boundary |
|------|----------|
| `process` | Host process with supervised lifecycle, env allowlist, and project-root cwd containment. This is **not** a hard sandbox. |
| `container` | Docker-backed execution through `docker run --rm --network none`, one explicit workspace mount, `/workspace` working directory, git safe-directory configuration for the mounted checkout, non-root UID/GID enforcement (defaults to the invoking host UID/GID when non-root, otherwise `10001:10001`), memory/CPU/PID limits, `no-new-privileges`, and the same env allowlist. |

Container mode requires Docker and the in-repo sandbox image. Build the default image with:

```bash
docker build -t fbeast/sandbox:latest -f Dockerfile .
```

The repository includes a root `.dockerignore` for this build context. Keep local secrets and agent state out of the image context by filtering `.env*` (except `.env.example`), `.fbeast/`, `.codex/`, `node_modules/`, `.git/`, build outputs, coverage, and logs before running `docker build`.

Unit tests do not require a Docker daemon because they assert the generated Docker command and Dockerfile hardening instead of launching Docker. Docker-backed integration tests are also present and are skipped automatically when Docker is unavailable; when Docker is installed they build `fbeast/sandbox:latest`, verify writable non-root workspace behavior, and run a memory-exceeding workload under the configured limits.

The default env allowlist is intentionally narrow: `PATH`, `HOME`, `LANG`, `LC_ALL`, `FRANKENBEAST_RUN_CONFIG`, `FRANKENBEAST_SPAWNED`, and the `FRANKENBEAST_MODULE_*` toggles for firewall, skills, memory, planner, critique, governor, and heartbeat. Secrets such as `GITHUB_TOKEN`, provider API keys, and arbitrary shell environment variables are not inherited unless the Beast definition explicitly places them in `spec.env` and the runtime policy allows the key.

`container` mode uses Docker `--network none` to deny container network access and defaults to `--memory 512m --cpus 1.0 --pids-limit 256`. `process` mode does not have OS-level network isolation; use firewall/governor controls as advisory gates only, or choose container mode when network denial is required. Docker `--network none` is not a micro-VM, gVisor, Firecracker, Wasm, or seccomp sandbox.

`SandboxPolicy.readOnlyWorkspaceMount` supports an opt-in `:ro` workspace bind mount for workloads that do not need to write to the checkout. It remains disabled by default because current beast runs write run config, checkpoints, and artifacts under the workspace; a disposable per-run workspace is safer future work for write-heavy tasks.

A franken-governor pre-deploy hook should be integrated at the dispatch/API layer where user, target, budget, and audit context are available. This Docker runtime layer now enforces the concrete container boundary, but it intentionally does not decide deployment approval policy.

---

## 6. Supported flags

The orchestrator CLI accepts global flags before or after the subcommand unless a command note below narrows the scope. Prefer the long `--flag value` form in scripts; `--flag=value` is also accepted for string options.

### Core run/config flags

| Flag | Applies to | Behavior |
|------|------------|----------|
| `--base-dir <path>` | all orchestrator commands | Project root for CLI-managed files and services; defaults to the current working directory. |
| `--base-branch <name>` | Beast issue/PR flows | Git base branch for PR creation; defaults to `main`. |
| `--budget <usd>` | Beast run/session flows | Spend limit in USD; defaults to `10`. |
| `--provider <name>` | Beast run/session flows | Primary CLI provider name; defaults to `claude`. Accepted CLI selector values are `claude`, `codex`, `gemini`, and `aider`; provider types such as `anthropic-api`, `openai-api`, and `gemini-api` are config surfaces, not direct `--provider` values for run/chat paths. |
| `--providers <list>` | Beast run/session flows | Comma-separated fallback chain, for example `--providers claude,codex,gemini`. Values are trimmed and lowercased. |
| `--trust-provider-command-overrides` | provider config loading | Explicitly permits trusted repo-configured provider command overrides. Leave unset for the safer default. |
| `--config <path>` | commands that load CLI config | JSON config file override. Explicit config paths fail closed when missing or invalid. |
| `--no-pr` | run/issues PR flows | Skip automated PR creation. |
| `--verbose` | all orchestrator commands | Enable debug logging and trace-viewer output. |
| `--help` | all orchestrator commands | Show the current CLI help surface. |

### Phase-selection and run-state flags

| Flag | Applies to | Behavior |
|------|------------|----------|
| `--design-doc <path>` | `plan`, full flow | Start from an existing design document instead of the interview output. |
| `--plan-dir <path>` | `run`, full flow | Execute chunks from an existing chunk-plan directory. |
| `--plan-name <name>` | `plan`, full flow | Override the generated plan name. |
| `--output-dir <path>` | parser-recognized compatibility flag | Accepted by the parser, but current plan/run flows still write artifacts under the configured `.fbeast` paths. Do not rely on it to redirect plan output in this build. |
| `--goal <text>` | parser-recognized compatibility flag | Accepted by the parser, but the current interview flow still starts from its built-in requirements-gathering prompt. |
| `--output <path>` | parser-recognized compatibility flag | Accepted by the parser, but the current interview flow still writes the design document through the configured `.fbeast` design-doc path. |
| `--reset` | `run` | Clear checkpoint and trace state before executing. |
| `--resume` | `run` | Preserve checkpoint/chunk-session state and resume from the last run. |
| `--cleanup` | `run` | Remove build logs, checkpoints, and traces without following symlinked cleanup entries. |

`--provider` selects the initial provider, while `--providers` supplies the comma-separated fallback order used by the managed provider flow. `--trust-provider-command-overrides` is intentionally explicit because it allows command overrides only from trusted config locations outside the repository; repo-local `.fbeast/config.json` command trust fields remain rejected.

Cold `frankenbeast run` starts from a clean execution checkpoint by default. Use `--resume` only when continuing an interrupted run; use `--reset` when you also want to clear memory, traces, and other build artifacts. `--cleanup` refuses to clean a symlinked `.build/` root or symlinked `.fbeast` cleanup component by default and unlinks symlinks found inside `.build/` instead of traversing them, so cleanup cannot delete files outside the project through a symlink. Symlinked workspace parents are allowed; replace symlinked `.fbeast`/`.build` cleanup path components with real disposable directories before cleaning.

### Init flags

| Flag | Applies to | Behavior |
|------|------------|----------|
| `--verify` | `init` | Verify init config/readiness without running the full wizard; the command still ensures the local `.fbeast` scaffold directories exist. |
| `--repair` | `init` | Re-run only missing or failed setup steps. |
| `--non-interactive` | `init` | Disable prompts for headless setup. Required HITL approvals still fail closed unless explicitly allowed by environment. |
| `--backend <name>` | `init` | Secret backend: `local-encrypted`, `os-keychain`, `1password`, or `bitwarden`. |

### Chat and Beast service flags

| Flag | Applies to | Behavior |
|------|------------|----------|
| `--host <host>` | `chat-server`, `beasts-daemon` | Bind host; defaults to `127.0.0.1`. |
| `--port <port>` | `chat-server`, `beasts-daemon` | Bind port; defaults to `3737` for `chat-server` and `4050` for `beasts-daemon`. |
| `--allow-origin <url>` | `chat-server` | Allow one additional websocket Origin beyond configured dashboard origins. The standalone `beasts-daemon` command currently forwards only host and port. |

### Beast dispatch/module flags

These flags are for `frankenbeast beasts create|spawn` unless otherwise noted. `status` and `logs` also accept `--mode` as a compatibility/read-only parser surface, but they report the execution mode stored on the run; passing `--mode` to those read-only commands does not change output.

| Flag | Applies to | Behavior |
|------|------------|----------|
| `--mode <mode>` | `beasts create`, `beasts spawn`; accepted read-only by `beasts status`, `beasts logs` | Beast execution mode for a new run: `process` or `container`. For status/logs, output comes from stored run metadata. |
| `--no-firewall` | `beasts create`, `beasts spawn` | Serialize firewall disabled in the spawned Beast config. |
| `--no-skills` | `beasts create`, `beasts spawn` | Serialize skills disabled in the spawned Beast config. |
| `--no-memory` | `beasts create`, `beasts spawn` | Serialize memory disabled in the spawned Beast config. |
| `--no-planner` | `beasts create`, `beasts spawn` | Serialize planner disabled in the spawned Beast config; this does not skip the CLI `plan` phase in this build. |
| `--no-critique` | `beasts create`, `beasts spawn` | Disable critique wiring where the spawned Beast dependency factory consumes the module setting. |
| `--no-governor` | `beasts create`, `beasts spawn` | Disable governor wiring where the spawned Beast dependency factory consumes the module setting. |
| `--no-heartbeat` | `beasts create`, `beasts spawn` | Serialize heartbeat disabled in the spawned Beast config. |

### Issues mode flags

| Flag | Applies to | Behavior |
|------|------------|----------|
| `--label <labels>` | `issues` | Comma-separated label filter, for example `critical,high`. |
| `--milestone <name>` | `issues` | Filter by milestone. |
| `--search <query>` | `issues` | Search issues by text. |
| `--assignee <user>` | `issues` | Filter by assignee. |
| `--limit <n>` | `issues` | Maximum issues to fetch; defaults to `30`. |
| `--repo <owner/repo>` | `issues` | Explicit target repository. Cannot be combined with `--target-upstream`. |
| `--target-upstream` | `issues` | Derive the canonical issue/PR repo from the fork upstream remote. |
| `--dry-run` | `issues` | Preview without executing fixes. |

### Network and MCP shim flags

| Flag | Applies to | Behavior |
|------|------------|----------|
| `-d`, `--detached` | `network up`, `network start`, `network restart` | Start configured network services, one managed service, or restarted services in daemon mode. |
| `--set <path=value>` | `network config`, `network up`, `network start`, `network restart` | Persist an operator config value with `network config`; for `up`/`start`/`restart`, apply a non-persistent config override for that invocation. May be repeated. |
| `--client=<claude|gemini|codex>` | `fbeast mcp init`, `fbeast mcp uninstall` | Target a specific MCP client config. |
| `--pick[=<servers>]` | `fbeast mcp init` | Choose which MCP servers to install. |
| `--mode=standard|proxy` | `fbeast mcp init` | Register individual MCP servers or the lower-context proxy server. |
| `--hooks` | `fbeast mcp init` | Install pre/post-tool hook scripts. |
| `--purge` | `fbeast mcp uninstall` | Remove stored fbeast data as well as MCP config. |
| `--provider=<anthropic-api|codex-cli|claude-cli>` | `fbeast mcp beast` | Activate the fbeast Beast-mode preset provider. |

Verbose and build-log output redacts secret-like environment/config keys such as `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, and `*_API_KEY` by default. The logger exposes an explicit local diagnostic override (`redactSecrets: false`) for trusted development-only callers, but normal CLI/runtime paths keep redaction enabled so environment dumps do not leak provider tokens or credentials. Redaction helpers also expose provenance-aware variants (`redactSensitiveTextWithProvenance` and `redactLogDataWithProvenance`) for audit paths that need to explain why a value was replaced; provenance records include only the matched key, source, and path, never the secret value itself.

### Init flag examples

```bash
frankenbeast init --verify                       # Verify config/readiness and ensure scaffold dirs exist
frankenbeast init --repair                       # Re-run only missing or failed init steps
frankenbeast init --non-interactive              # Disable interactive prompts
frankenbeast init --backend os-keychain          # Secret backend: local-encrypted, os-keychain, 1password, bitwarden
```

### Chat and daemon flag examples

```bash
frankenbeast chat-server --host 127.0.0.1 --port 3737
frankenbeast chat-server --allow-origin http://localhost:5173
frankenbeast beasts-daemon --host 127.0.0.1 --port 4050
```

`chat-server` defaults to port `3737`; `beasts-daemon` defaults to port `4050`. Both default to `127.0.0.1`. Use `--allow-origin` to allow one additional websocket Origin for local browser or preview tooling.

### Beast dispatch flag examples

```bash
frankenbeast beasts spawn martin-loop --mode process
frankenbeast beasts spawn martin-loop --mode container
frankenbeast beasts create chunk-plan --no-critique --no-governor
```

`--mode` changes execution mode only for `beasts create` and `beasts spawn`. `beasts status` and `beasts logs` accept it for parser compatibility, but their output comes from stored run metadata. Valid execution modes are `process` and `container`.

Module toggles apply to `beasts create` / `beasts spawn` run configs. Some toggles are persisted for downstream module wiring rather than changing the top-level CLI flow; for example, `--no-planner` does not skip `frankenbeast plan` chunk generation in this build.

```bash
--no-firewall    # Disable firewall module
--no-skills      # Disable skills module
--no-memory      # Disable memory module
--no-planner     # Disable planner module
--no-critique    # Disable critique module
--no-governor    # Disable governor module
--no-heartbeat   # Disable heartbeat module
```

### Issues flag examples

```bash
frankenbeast issues --repo owner/repo            # Explicit GitHub repo
frankenbeast issues --target-upstream            # Derive canonical repo from fork upstream remote
frankenbeast issues --label bug,critical         # Filter by comma-separated labels
frankenbeast issues --milestone v1               # Filter by milestone
frankenbeast issues --search "parser docs"       # Search issue text
frankenbeast issues --assignee octocat           # Filter by assignee
frankenbeast issues --limit 10                   # Max issues to fetch (default: 30)
frankenbeast issues --dry-run                    # Preview without executing
```

`--repo` and `--target-upstream` are mutually exclusive because `--repo` explicitly selects the canonical repository while `--target-upstream` derives it from git remotes.

---

## 7. Chat REPL and server

```bash
frankenbeast chat              # Interactive chat REPL (uses ConversationEngine)
frankenbeast chat-server       # HTTP + WebSocket server for franken-web (port 3737)
frankenbeast beasts-daemon     # Standalone Beast API/control plane (port 4050)
```

The Beast daemon owns `/v1/beasts/*` state, logs, lifecycle, SSE tickets/events, and PID-file protection at `.frankenbeast/beasts-daemon.pid`. The chat server remains the chat/WebSocket backend and can proxy `/v1/beasts/*` to the daemon for gateway compatibility. Use `--port` and `--host` to override defaults.

To attach `chat-server` to a standalone daemon, start both processes with the same Beast operator token and point the chat server at the daemon URL:

```bash
FRANKENBEAST_BEAST_OPERATOR_TOKEN="$BEAST_OPERATOR_TOKEN" \
  frankenbeast beasts-daemon

FRANKENBEAST_BEAST_OPERATOR_TOKEN="$BEAST_OPERATOR_TOKEN" \
FRANKENBEAST_BEAST_DAEMON_URL=http://127.0.0.1:4050 \
  frankenbeast chat-server
```

`FRANKENBEAST_BEAST_DAEMON_URL` is the explicit external-daemon selector. If it is absent and an operator token is configured, `chat-server` first tries to detect a healthy local `beasts-daemon` from `.frankenbeast/beasts-daemon.pid`; when no daemon is detected, it falls back to local in-process Beast services.

---

## 8. Skills

```bash
frankenbeast skill list
frankenbeast skill info <name>
frankenbeast skill enable <name>
frankenbeast skill disable <name>
frankenbeast skill add <name> <command> [args]
frankenbeast skill scaffold <name>
frankenbeast skill remove <name>
```

---

## 9. Issues mode (GitHub)

```bash
frankenbeast issues                        # fetch open issues, pick and solve one
frankenbeast issues --label bug            # filter by label
frankenbeast issues --limit 10             # limit fetch count
frankenbeast issues --repo owner/repo      # explicit repo
frankenbeast issues --dry-run              # preview without executing
```

---

## 10. Network services

Use `up` and `down` for the whole configured network lifecycle. Use `start`, `stop`, and `restart` when you want to control one managed service, or pass `all` to apply the action to every service without changing the operator config.

```bash
frankenbeast network up                    # start configured services
frankenbeast network up -d                 # detached (daemon mode)
frankenbeast network status                # show service health and URLs
frankenbeast network start chat-server     # start one managed service
frankenbeast network stop dashboard-web    # stop one managed service
frankenbeast network restart beasts-daemon # restart one managed service
frankenbeast network restart all           # restart every managed service
frankenbeast network down                  # tear down the managed network
frankenbeast network logs <service|all>    # show service logs
frankenbeast network config                # inspect operator config
frankenbeast network config --set chat.model=claude-sonnet-4-6
                                           # update one operator config value
frankenbeast network up --set chat.model=codex
                                           # one-off override for this start
```

Network `up`, `start`, and `restart` accept `-d` / `--detached` for daemon mode and `--set path=value` for transient config overrides. `network config --set path=value` persists the value; either form may be repeated when changing more than one config path.

---

## Status: what's working

| Feature | Status |
|---------|--------|
| `fbeast mcp init` / MCP registration | ✅ |
| `fbeast mcp beast` / mode activation | ✅ |
| `frankenbeast interview` | ✅ |
| `frankenbeast plan` | ✅ |
| `frankenbeast run` | ✅ |
| `frankenbeast beasts *` | ✅ |
| `frankenbeast chat` / `chat-server` | ✅ |
| `frankenbeast beasts-daemon` | ✅ |
| `frankenbeast skill *` | ✅ |
| `frankenbeast security *` | ✅ |
| `frankenbeast network *` | ✅ |
| `frankenbeast issues` | ✅ |

---

## Beast verification matrix

Run this focused matrix before claiming the live Beast surface is usable:

```bash
cd packages/franken-orchestrator
npm test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts tests/integration/cli/dep-factory-wiring.test.ts tests/unit/cli/beast-cli.test.ts tests/integration/beasts/agent-routes.test.ts tests/unit/cli/skill-cli.test.ts tests/unit/cli/security-cli.test.ts tests/unit/cli/network-run.test.ts tests/unit/cli/session-issues.test.ts tests/integration/chat/chat-routes.test.ts tests/integration/chat/ws-chat-server.test.ts tests/integration/network/network-cli.test.ts tests/integration/issues/issues-e2e.test.ts tests/e2e/smoke.test.ts
npm run typecheck
```

The matrix covers parser/config truthfulness, `run` and `run --resume`, required dependency assembly, `beasts`, `beasts-daemon`, `skill`, `security`, `network`, `issues`, `chat`, `chat-server`, and the core Beast loop smoke path.

---

## Troubleshooting

**`frankenbeast: command not found`**

From the repo root, refresh the supported local links and verify both CLIs:
```bash
npm run local:link
npm run local:verify-cli
```

**`fbeast-proxy` / `fbeast-memory` not found after `fbeast mcp init`**

Use the same repo-root repair path; `local:link` links the workspace that owns the `fbeast-*` binaries, and `local:verify-cli` checks the primary `fbeast` / `frankenbeast` entrypoints:
```bash
npm run local:link
npm run local:verify-cli
command -v fbeast-proxy fbeast-memory
```

**Beast fails to start with "binary not found"**
```bash
# Check frankenbeast is on PATH
which frankenbeast

# Or run directly
node packages/franken-orchestrator/dist/cli/run.js beasts catalog
```

**API key missing**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or add to .env at repo root
```
