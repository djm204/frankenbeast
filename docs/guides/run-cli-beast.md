# Running the CLI Beast Harness

The beast harness is split across two CLIs. This guide covers both.

| CLI | Package | Role |
|-----|---------|------|
| `fbeast` | `@fbeast/mcp-suite` | MCP server registration, beast-mode activation shim |
| `frankenbeast` / `franken` / `frkn` | `franken-orchestrator` | The actual beast loop — interview, plan, execute |

---

## Prerequisites

- Node.js >= 22
- An API key for at least one provider: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or a local Ollama instance

```bash
cp .env.example .env
# Set ANTHROPIC_API_KEY (or OPENAI_API_KEY / OLLAMA_BASE_URL)
```

---

## 1. Install and link the CLIs

From the repo root:

```bash
npm install
npm run build
npm link --workspace=packages/franken-mcp-suite
npm link --workspace=packages/franken-orchestrator
```

Verify:

```bash
fbeast --help          # MCP suite CLI
frankenbeast --help    # Orchestrator CLI
```

---

## 2. Register MCP servers (`fbeast init`)

Run once per project directory:

```bash
fbeast init                          # standard — 7 individual servers
fbeast init --mode=proxy             # proxy — 1 server, 2 meta-tools (lower context cost)
fbeast init --hooks                  # also install pre/post-tool hooks
fbeast init --client=gemini          # target Gemini CLI instead of Claude Code (auto-detected)
fbeast init --client=codex           # target Codex CLI
```

This writes MCP entries into your client config (`~/.claude/settings.json`, `~/.gemini/settings.json`, etc.) and creates `.fbeast/beast.db`.

---

## 3. Activate beast mode (`fbeast beast`)

```bash
fbeast beast                                    # default provider: anthropic-api
fbeast beast --provider=anthropic-api           # Claude via API key
fbeast beast --provider=codex-cli              # Codex (requires Codex CLI installed)
fbeast beast --provider=claude-cli             # Claude CLI binary (prompts for risk acknowledgement)
```

This writes `.fbeast/config.json` with `mode: "beast"` and prints the beast catalog. The `claude-cli` provider spawns subprocesses outside the API billing path and asks for one-time confirmation.

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
```

Available catalog entries: `design-interview`, `chunk-plan`, `martin-loop`.

---

## 6. Useful flags

```bash
--provider claude              # LLM provider (claude, codex, gemini, aider)
--providers claude,gemini      # Fallback chain — tries each on failure
--budget 5                     # Spend limit in USD (default: 10)
--base-branch main             # Git base branch for PRs
--no-pr                        # Skip PR creation
--verbose                      # Debug logs + trace viewer
--reset                        # Clear checkpoint and start fresh
--resume                       # Preserve checkpoint/chunk-session state and resume from the last run
--cleanup                      # Remove all build logs, checkpoints, traces
```

Cold `frankenbeast run` starts from a clean execution checkpoint by default. Use `--resume` only when continuing an interrupted run; use `--reset` when you also want to clear memory, traces, and other build artifacts.

---

## 7. Chat REPL and server

```bash
frankenbeast chat              # Interactive chat REPL (uses ConversationEngine)
frankenbeast chat-server       # HTTP + WebSocket server for franken-web (port 3737)
```

The chat server is the backend for the franken-web dashboard. Use `--port` and `--host` to override defaults.

---

## 8. Skills

```bash
frankenbeast skill list
frankenbeast skill info <name>
frankenbeast skill enable <name>
frankenbeast skill disable <name>
frankenbeast skill add <name>
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

```bash
frankenbeast network up                    # start configured services
frankenbeast network up -d                 # detached (daemon mode)
frankenbeast network status                # show service health and URLs
frankenbeast network down                  # tear down
frankenbeast network logs <service|all>    # show service logs
frankenbeast network config                # inspect operator config
```

---

## Status: what's working

| Feature | Status |
|---------|--------|
| `fbeast init` / MCP registration | ✅ |
| `fbeast beast` / mode activation | ✅ |
| `frankenbeast interview` | ✅ |
| `frankenbeast plan` | ✅ |
| `frankenbeast run` | ✅ |
| `frankenbeast beasts *` | ✅ |
| `frankenbeast chat` / `chat-server` | ✅ |
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

The matrix covers parser/config truthfulness, `run` and `run --resume`, required dependency assembly, `beasts`, `skill`, `security`, `network`, `issues`, `chat`, `chat-server`, and the core Beast loop smoke path.

---

## Troubleshooting

**`frankenbeast: command not found`**
```bash
npm link --workspace=packages/franken-orchestrator
```

**`fbeast-proxy` / `fbeast-memory` not found after `fbeast init`**
```bash
npm link --workspace=packages/franken-mcp-suite
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
