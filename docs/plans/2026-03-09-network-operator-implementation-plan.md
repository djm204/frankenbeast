# Network Operator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a config-driven `frankenbeast network` operator that supervises request-serving Frankenbeast services, exposes the same controls through the dashboard, and makes `frankenbeast chat` attach to managed chat when available.

**Architecture:** Implement the network operator in `franken-orchestrator` as a shared backend engine with a service registry, operator state store, config projection, and secret-mode abstraction. Keep services standalone-capable, but allow operator-managed config injection to override local config. Expose the same semantics through CLI and `franken-web`.

**Tech Stack:** TypeScript, Node child-process supervision, Hono, existing CLI/config infrastructure, React, Vitest.

---

### Task 1: Add CLI surface for `network` subcommands

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/args.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`

**Step 1: Write the failing parser tests**

Add parser coverage for:

- `network`
- `network up`
- `network up -d`
- `network down`
- `network status`
- `network start <service>`
- `network stop <service>`
- `network restart <service>`
- `network logs <service>`
- `network config`
- `network config --set <path>=<value>`
- `network help`

Also cover usage text for the new command family.

**Step 2: Run the parser tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts
```

Expected: FAIL because `network` does not exist yet.

**Step 3: Implement the minimal CLI parsing changes**

Add:

- `network` as a valid subcommand
- second-level network action parsing
- flags for `-d` and `--set`
- help text for the network command family

Keep changes limited to parsing and dispatch shape.

**Step 4: Re-run the parser tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/args.test.ts tests/unit/cli/run.test.ts
```

Expected: PASS for the parser path, but later run tests may still fail until dispatch exists.

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/tests/unit/cli/args.test.ts packages/franken-orchestrator/tests/unit/cli/run.test.ts
git commit -m "feat(network): add CLI command surface"
```

---

### Task 2: Add canonical network config and config-path editing

**Files:**
- Create: `packages/franken-orchestrator/src/network/network-config.ts`
- Create: `packages/franken-orchestrator/src/network/network-config-paths.ts`
- Modify: `packages/franken-orchestrator/src/config/orchestrator-config.ts`
- Modify: `packages/franken-orchestrator/src/cli/config-loader.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-config.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-config-paths.test.ts`

**Step 1: Write the failing config tests**

Add tests for:

- secure vs insecure mode defaults
- service enablement flags
- network-relevant URLs/ports
- `config --set` path parsing for values like `chat.model=...` and `comms.slack.enabled=true`
- sensitive-path classification so secret fields are handled as refs rather than raw literals

**Step 2: Run the config tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-config.test.ts tests/unit/network/network-config-paths.test.ts
```

Expected: FAIL because the network config modules do not exist yet.

**Step 3: Implement the config schema and path tooling**

Create:

- canonical `network` config schema
- path getter/setter utilities for dotted keys
- sensitive-path classification
- config merge support in the existing loader

Do not implement secret backends yet beyond refs and classification.

**Step 4: Re-run the config tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-config.test.ts tests/unit/network/network-config-paths.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/network-config.ts packages/franken-orchestrator/src/network/network-config-paths.ts packages/franken-orchestrator/src/config/orchestrator-config.ts packages/franken-orchestrator/src/cli/config-loader.ts packages/franken-orchestrator/tests/unit/network/network-config.test.ts packages/franken-orchestrator/tests/unit/network/network-config-paths.test.ts
git commit -m "feat(network): add canonical operator config"
```

---

### Task 3: Build the service registry and runtime config projection

**Files:**
- Create: `packages/franken-orchestrator/src/network/network-registry.ts`
- Create: `packages/franken-orchestrator/src/network/services/chat-server-service.ts`
- Create: `packages/franken-orchestrator/src/network/services/dashboard-web-service.ts`
- Create: `packages/franken-orchestrator/src/network/services/comms-gateway-service.ts`
- Create: `packages/franken-orchestrator/src/network/services/compose-service.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-registry.test.ts`

**Step 1: Write the failing registry tests**

Cover:

- selecting services from config
- dependency ordering
- disabled services being skipped cleanly
- config projection for each service
- service-specific explanation strings for status/help

**Step 2: Run the registry tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-registry.test.ts
```

Expected: FAIL because the registry does not exist yet.

**Step 3: Implement the registry**

Add explicit service definitions for:

- `chat-server`
- `dashboard-web`
- `comms-gateway`
- compose-backed infra where required by config

Keep service definitions explicit and config-driven.

**Step 4: Re-run the registry tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-registry.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/network-registry.ts packages/franken-orchestrator/src/network/services/chat-server-service.ts packages/franken-orchestrator/src/network/services/dashboard-web-service.ts packages/franken-orchestrator/src/network/services/comms-gateway-service.ts packages/franken-orchestrator/src/network/services/compose-service.ts packages/franken-orchestrator/tests/unit/network/network-registry.test.ts
git commit -m "feat(network): add config-driven service registry"
```

---

### Task 4: Implement operator state, logs, and foreground/detached supervision

**Files:**
- Create: `packages/franken-orchestrator/src/network/network-state-store.ts`
- Create: `packages/franken-orchestrator/src/network/network-logs.ts`
- Create: `packages/franken-orchestrator/src/network/network-health.ts`
- Create: `packages/franken-orchestrator/src/network/network-supervisor.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-state-store.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-supervisor.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-logs.test.ts`

**Step 1: Write the failing supervision tests**

Cover:

- foreground start/stop ordering
- detached state-file creation
- stale state handling
- log file registration
- healthcheck precedence over stale state

**Step 2: Run the supervision tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-state-store.test.ts tests/unit/network/network-supervisor.test.ts tests/unit/network/network-logs.test.ts
```

Expected: FAIL because the supervisor modules do not exist yet.

**Step 3: Implement the supervision layer**

Implement:

- state file storage
- process bookkeeping
- foreground and detached launch behavior
- healthcheck helpers
- log multiplexing/tailing support

Use minimal internal abstractions; avoid over-designing a general orchestrator.

**Step 4: Re-run the supervision tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-state-store.test.ts tests/unit/network/network-supervisor.test.ts tests/unit/network/network-logs.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/network-state-store.ts packages/franken-orchestrator/src/network/network-logs.ts packages/franken-orchestrator/src/network/network-health.ts packages/franken-orchestrator/src/network/network-supervisor.ts packages/franken-orchestrator/tests/unit/network/network-state-store.test.ts packages/franken-orchestrator/tests/unit/network/network-supervisor.test.ts packages/franken-orchestrator/tests/unit/network/network-logs.test.ts
git commit -m "feat(network): add supervisor runtime and state"
```

---

### Task 5: Implement `network up/down/status/start/stop/restart/logs/help`

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Modify: `packages/franken-orchestrator/src/cli/args.ts`
- Create: `packages/franken-orchestrator/src/network/network-help.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/network-run.test.ts`
- Test: `packages/franken-orchestrator/tests/integration/network/network-cli.test.ts`

**Step 1: Write the failing run-path tests**

Cover:

- `up` starts enabled services
- `down` tears down detached services
- `status` reports service and mode state
- `start/stop/restart` target one service or `all`
- `logs` resolves the correct log source
- `help` prints a man-style command reference

**Step 2: Run the run-path tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/network-run.test.ts tests/integration/network/network-cli.test.ts
```

Expected: FAIL because the command family does not exist yet.

**Step 3: Implement the command handlers**

Wire the network supervisor into CLI dispatch and add the help formatter.

Make sure:

- foreground mode owns child processes
- detached mode updates state
- status output is operator-readable

**Step 4: Re-run the run-path tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/network-run.test.ts tests/integration/network/network-cli.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/src/cli/args.ts packages/franken-orchestrator/src/network/network-help.ts packages/franken-orchestrator/tests/unit/cli/network-run.test.ts packages/franken-orchestrator/tests/integration/network/network-cli.test.ts
git commit -m "feat(network): implement operator command family"
```

---

### Task 6: Make services accept managed config overrides while preserving standalone mode

**Files:**
- Modify: `packages/franken-orchestrator/src/http/chat-server.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`
- Create: `packages/franken-comms/src/server/start-comms-server.ts`
- Modify: `packages/franken-comms/src/server/app.ts`
- Modify: `packages/franken-web/package.json`
- Test: `packages/franken-orchestrator/tests/integration/network/managed-chat-server.test.ts`
- Test: `packages/franken-comms/tests/unit/managed-config.test.ts`

**Step 1: Write the failing managed-config tests**

Cover:

- services accept injected runtime config
- local standalone config still works when no override is passed
- managed mode overrides local config

**Step 2: Run the managed-config tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/integration/network/managed-chat-server.test.ts
npm --workspace franken-comms test -- tests/unit/managed-config.test.ts
```

Expected: FAIL because managed override seams are incomplete.

**Step 3: Implement managed override support**

Add:

- chat-server startup overrides
- comms server startup entrypoint and override handling
- clean dev command support for `franken-web`

Do not remove standalone service behavior.

**Step 4: Re-run the managed-config tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/integration/network/managed-chat-server.test.ts
npm --workspace franken-comms test -- tests/unit/managed-config.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/http/chat-server.ts packages/franken-orchestrator/src/http/chat-app.ts packages/franken-comms/src/server/start-comms-server.ts packages/franken-comms/src/server/app.ts packages/franken-web/package.json packages/franken-orchestrator/tests/integration/network/managed-chat-server.test.ts packages/franken-comms/tests/unit/managed-config.test.ts
git commit -m "feat(network): support managed service config overrides"
```

---

### Task 7: Make `frankenbeast chat` attach to managed chat when available

**Files:**
- Modify: `packages/franken-orchestrator/src/cli/run.ts`
- Create: `packages/franken-orchestrator/src/network/chat-attach.ts`
- Test: `packages/franken-orchestrator/tests/unit/cli/chat-attach.test.ts`

**Step 1: Write the failing attach tests**

Cover:

- attach to managed chat when the network-managed chat service is healthy
- fall back to standalone chat when not healthy
- ignore stale detached state if healthcheck fails

**Step 2: Run the attach tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/chat-attach.test.ts
```

Expected: FAIL because `chat` is not network-aware yet.

**Step 3: Implement attach-vs-standalone logic**

Use healthcheck-first detection, with operator state as a hint only.

**Step 4: Re-run the attach tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/cli/chat-attach.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/cli/run.ts packages/franken-orchestrator/src/network/chat-attach.ts packages/franken-orchestrator/tests/unit/cli/chat-attach.test.ts
git commit -m "feat(chat): attach CLI chat to managed network service"
```

---

### Task 8: Add secure/insecure mode and secret backend abstraction

**Files:**
- Create: `packages/franken-orchestrator/src/network/network-secrets.ts`
- Create: `packages/franken-orchestrator/src/network/secret-backends/one-password.ts`
- Create: `packages/franken-orchestrator/src/network/secret-backends/bitwarden.ts`
- Create: `packages/franken-orchestrator/src/network/secret-backends/os-store.ts`
- Create: `packages/franken-orchestrator/src/network/secret-backends/local-encrypted-store.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/network-secrets.test.ts`
- Test: `packages/franken-orchestrator/tests/unit/network/secret-backends.test.ts`

**Step 1: Write the failing secret-mode tests**

Cover:

- secure/insecure mode selection
- sensitive config paths stored as refs, not raw values
- redaction of sensitive values in status and state output
- backend detection ordering
- local encrypted fallback being allowed but marked weaker

**Step 2: Run the secret tests to verify they fail**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-secrets.test.ts tests/unit/network/secret-backends.test.ts
```

Expected: FAIL because the abstraction does not exist yet.

**Step 3: Implement the minimal secret abstraction**

Implement:

- secure/insecure mode model
- sensitive-path classification
- ref-based config storage
- backend detection stubs/adapters
- redaction helpers

Do not overbuild full backend auth flows in this task; keep the interface clean enough for follow-up depth.

**Step 4: Re-run the secret tests**

Run:

```bash
npm --workspace franken-orchestrator test -- tests/unit/network/network-secrets.test.ts tests/unit/network/secret-backends.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/network/network-secrets.ts packages/franken-orchestrator/src/network/secret-backends/one-password.ts packages/franken-orchestrator/src/network/secret-backends/bitwarden.ts packages/franken-orchestrator/src/network/secret-backends/os-store.ts packages/franken-orchestrator/src/network/secret-backends/local-encrypted-store.ts packages/franken-orchestrator/tests/unit/network/network-secrets.test.ts packages/franken-orchestrator/tests/unit/network/secret-backends.test.ts
git commit -m "feat(network): add secure and insecure secret modes"
```

---

### Task 9: Add dashboard network control pages and shared config editing

**Files:**
- Create: `packages/franken-web/src/pages/network-page.tsx`
- Create: `packages/franken-web/src/components/network-status-grid.tsx`
- Create: `packages/franken-web/src/components/network-service-list.tsx`
- Create: `packages/franken-web/src/components/network-logs-panel.tsx`
- Create: `packages/franken-web/src/components/network-config-editor.tsx`
- Create: `packages/franken-web/src/lib/network-api.ts`
- Modify: `packages/franken-web/src/components/chat-shell.tsx`
- Test: `packages/franken-web/tests/components/network-page.test.tsx`
- Test: `packages/franken-web/tests/lib/network-api.test.ts`

**Step 1: Write the failing dashboard tests**

Cover:

- status rendering
- service controls
- secure/insecure mode visibility
- config editing interactions
- logs panel behavior

**Step 2: Run the dashboard tests to verify they fail**

Run:

```bash
npm --workspace @frankenbeast/web test -- tests/components/network-page.test.tsx tests/lib/network-api.test.ts
```

Expected: FAIL because the network UI does not exist yet.

**Step 3: Implement the dashboard control surface**

Add:

- network page
- API client
- service controls
- config editor
- logs and health views

Reuse the operator backend; do not invent client-only logic.

**Step 4: Re-run the dashboard tests**

Run:

```bash
npm --workspace @frankenbeast/web test -- tests/components/network-page.test.tsx tests/lib/network-api.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/franken-web/src/pages/network-page.tsx packages/franken-web/src/components/network-status-grid.tsx packages/franken-web/src/components/network-service-list.tsx packages/franken-web/src/components/network-logs-panel.tsx packages/franken-web/src/components/network-config-editor.tsx packages/franken-web/src/lib/network-api.ts packages/franken-web/src/components/chat-shell.tsx packages/franken-web/tests/components/network-page.test.tsx packages/franken-web/tests/lib/network-api.test.ts
git commit -m "feat(web): add dashboard network operator controls"
```

---

### Task 10: Final docs and verification

**Files:**
- Create: `docs/guides/run-network-operator.md`
- Modify: `README.md`
- Modify: `docs/RAMP_UP.md`

**Step 1: Write the guide after functionality is complete**

Document:

- `network up/down/status/start/stop/restart/logs/config/help`
- secure vs insecure mode
- recommended secure backends
- how `chat` attaches to managed network chat
- dashboard control path

**Step 2: Run the full verification suite**

Run:

```bash
npm --workspace franken-orchestrator test
npm --workspace franken-orchestrator run typecheck
npm --workspace franken-comms test
npm --workspace franken-comms run typecheck
npm --workspace @frankenbeast/web test
npm --workspace @frankenbeast/web run typecheck
npm --workspace @frankenbeast/web run build
```

Then manually verify:

```bash
npm --workspace franken-orchestrator run build
node packages/franken-orchestrator/dist/cli/run.js network up
node packages/franken-orchestrator/dist/cli/run.js network status
node packages/franken-orchestrator/dist/cli/run.js network down
```

Expected:

- enabled services start from config
- status is truthful
- chat attaches when managed chat is running
- no plaintext secret values appear in logs or state files

**Step 3: Commit**

```bash
git add docs/guides/run-network-operator.md README.md docs/RAMP_UP.md
git commit -m "docs(network): add operator guide and verification"
```
