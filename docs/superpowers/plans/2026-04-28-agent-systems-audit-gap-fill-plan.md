# Agent Systems Audit Gap Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the concrete gaps documented in `docs/audits/agent-systems-audit-2026-04-28.md` with fail-closed security defaults, central validation, sandboxed Beast execution, and replayable execution records.

**Architecture:** Land the work in priority order. First close boundary bugs that can be fixed without a new runtime (`chat` HTTP auth, HITL fail-closed behavior, MCP input validation, firewall path containment). Then add an explicit sandbox abstraction with a real Docker/no-network container backend and tighter process defaults. Finally extend observer/orchestrator persistence so replay uses saved LLM/tool inputs and outputs instead of timeline-only summaries.

**Tech Stack:** TypeScript, Hono, Vitest, Node child process APIs, existing SQLite stores, existing Zod usage in `@franken/orchestrator`, MCP SDK request handlers, Docker CLI as the first concrete container backend.

---

## Source Audit

Audit artifact: `docs/audits/agent-systems-audit-2026-04-28.md`.

Date note: the workspace shell reported `2026-04-27 CDT`, but the audit file is dated `2026-04-28`. Treat this plan as the implementation plan for the `2026-04-28` audit.

## File Structure

- Modify `packages/franken-orchestrator/src/http/operator-auth.ts`: shared operator-token extraction and Hono middleware for bearer and `x-frankenbeast-operator-token` auth.
- Modify `packages/franken-orchestrator/src/beasts/http/beast-auth.ts`: delegate to the shared operator auth helper.
- Modify `packages/franken-orchestrator/src/http/chat-app.ts`: wire operator auth into `/v1/chat/*` routes when an operator token is configured.
- Modify `packages/franken-orchestrator/src/http/routes/chat-routes.ts`: keep `/health` public and require auth for session, message, stream-ticket, and approval routes through app-level middleware.
- Modify `packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts`: add unauthorized and authorized HTTP chat route regressions.
- Modify `packages/franken-orchestrator/src/cli/dep-factory.ts`: replace non-TTY auto-approval with a fail-closed governor decision unless an explicit test/dev override is configured.
- Modify `packages/franken-orchestrator/tests/unit/cli/run.test.ts` and `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`: lock non-interactive governor behavior.
- Modify `packages/franken-governor/src/gateway/approval-gateway.ts`: throw when `requireSignedApprovals` is true without a verifier.
- Modify `packages/franken-governor/src/server/app.ts`: require a signing secret for `/v1/approval/respond` and Slack webhooks outside explicit insecure test mode.
- Modify `packages/franken-governor/tests/unit/gateway/approval-gateway-security.test.ts` and `packages/franken-governor/tests/unit/server/app.test.ts`: add fail-closed signature tests.
- Modify `packages/franken-mcp-suite/src/shared/server-factory.ts`: enforce advertised MCP input schemas before handler calls.
- Modify `packages/franken-mcp-suite/src/shared/server-factory.test.ts`: prove required, type, and unknown-field validation happens centrally.
- Modify `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts`: constrain `scanFile` to the configured project root.
- Modify `packages/franken-mcp-suite/src/servers/firewall.ts` and `packages/franken-mcp-suite/src/servers/firewall.test.ts`: pass root options and prove outside-root reads are rejected.
- Create `packages/franken-orchestrator/src/beasts/execution/sandbox-policy.ts`: shared environment allowlist, cwd containment, network policy, and mount policy types.
- Create `packages/franken-orchestrator/src/beasts/execution/docker-container-runtime.ts`: Docker command builder for `--network=none`, explicit mounts, explicit env allowlist, and working directory mapping.
- Modify `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts`: replace the placeholder with a real executor using the Docker runtime and existing repository/log/event patterns.
- Modify `packages/franken-orchestrator/src/beasts/create-beast-services.ts`: construct `ContainerBeastExecutor` with the repository, log store, event bus, and Docker runtime.
- Add `packages/franken-orchestrator/tests/unit/beasts/execution/docker-container-runtime.test.ts` and replace `packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts`: verify generated Docker args, no host network, no broad env inheritance, lifecycle updates, logs, stop, and kill.
- Modify `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`: add a default env allowlist and cwd containment for process mode, preserving explicit `spec.env` only.
- Modify `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`: prove ordinary host secrets are not inherited and cwd escapes are rejected.
- Create `packages/franken-observer/src/replay/replay-record.ts`: versioned replay record types for LLM requests/responses, tool calls/results, environment snapshots, and hashes.
- Create `packages/franken-observer/src/replay/replay-content-store.ts`: local content-addressed store under `.fbeast/audit/blobs/`.
- Modify `packages/franken-observer/src/audit-trail-store.ts`: persist replay manifests next to event trails.
- Modify `packages/franken-observer/src/execution-replayer.ts`: add a deterministic replay path that consumes saved records and verifies hashes.
- Modify `packages/franken-observer/src/index.ts`: export replay record/store/verifier APIs.
- Add `packages/franken-observer/src/replay/replay-content-store.test.ts` and `packages/franken-observer/src/replay/deterministic-replayer.test.ts`.
- Modify `packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts`, `packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`, and `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`: record LLM/tool replay records through the observer adapter.
- Modify `packages/franken-orchestrator/src/beast-loop.ts` and `packages/franken-orchestrator/src/context/franken-context.ts`: persist finite-state transitions after each phase.
- Add `packages/franken-orchestrator/tests/unit/beast-loop-state-persistence.test.ts` and extend `packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`.
- Create `docs/adr/033-agent-runtime-sandbox-and-replay.md`: document the implemented boundary model and the claim boundaries.
- Update `docs/guides/run-cli-beast.md`: document process versus container execution, env allowlist, network policy, and replay artifacts.
- Update `docs/audits/agent-systems-audit-2026-04-28.md`: add a follow-up section with the implemented fixes and verification commands after implementation is complete.

## Task 1: Fail-Closed HTTP And Approval Boundaries

**Files:**
- Create: `packages/franken-orchestrator/src/http/operator-auth.ts`
- Modify: `packages/franken-orchestrator/src/beasts/http/beast-auth.ts`
- Modify: `packages/franken-orchestrator/src/http/chat-app.ts`
- Modify: `packages/franken-orchestrator/src/http/routes/chat-routes.ts`
- Modify: `packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts`
- Modify: `packages/franken-orchestrator/src/cli/dep-factory.ts`
- Modify: `packages/franken-orchestrator/tests/unit/cli/run.test.ts`
- Modify: `packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts`
- Modify: `packages/franken-governor/src/gateway/approval-gateway.ts`
- Modify: `packages/franken-governor/src/server/app.ts`
- Modify: `packages/franken-governor/tests/unit/gateway/approval-gateway-security.test.ts`
- Modify: `packages/franken-governor/tests/unit/server/app.test.ts`

- [ ] **Step 1: Add red HTTP chat auth tests**

Add tests proving `POST /v1/chat/sessions`, `GET /v1/chat/sessions`, `GET /v1/chat/sessions/:id`, `POST /v1/chat/sessions/:id/messages`, and `POST /v1/chat/sessions/:id/approve` return `401` without auth when `operatorToken` is configured, while `/health` remains public.

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/integration/chat/chat-routes.test.ts
```

Expected: FAIL because chat routes currently accept unauthenticated requests.

- [ ] **Step 2: Implement shared operator auth**

Create `packages/franken-orchestrator/src/http/operator-auth.ts` with:

```ts
import { createMiddleware } from 'hono/factory';
import { HttpError } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';

export interface OperatorAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

export function extractOperatorToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) return undefined;
  const [scheme, token] = headerValue.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function requireOperatorAuth(options: OperatorAuthOptions) {
  return createMiddleware(async (c, next) => {
    const provided = extractOperatorToken(c.req.header('authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? undefined;

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
```

Update `beast-auth.ts` to call `requireOperatorAuth`.

- [ ] **Step 3: Wire chat auth through `createChatApp`**

Add optional `operatorToken?: string` to `ChatAppOptions`. In `createChatApp`, apply `requireOperatorAuth` to `/v1/chat/*` when `operatorToken` or `beastControl.operatorToken` is configured. Keep `/health` outside that middleware.

Run the red chat test again.

Expected: PASS for unauthorized checks and existing chat route behavior.

- [ ] **Step 4: Add red fail-closed governor tests**

Add tests proving:

- `ApprovalGateway` constructor throws when `config.requireSignedApprovals === true` and no `signatureVerifier` is supplied.
- Governor `/v1/approval/respond` returns `500` or startup construction throws when the route is used without a signing secret unless `allowUnsignedApprovalsForTests: true` is explicitly set.
- Non-interactive orchestrator CLI dependency wiring does not default to approved.

Run:

```bash
cd packages/franken-governor
npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/server/app.test.ts
cd ../@franken/orchestrator
npm test -- --run tests/unit/cli/run.test.ts tests/integration/cli/dep-factory-wiring.test.ts
```

Expected: FAIL on the current permissive behavior.

- [ ] **Step 5: Implement fail-closed approval behavior**

In `ApprovalGateway` constructor, throw a `SignatureVerificationError`-style configuration error if signed approvals are required without a verifier. In `createGovernorApp`, add `allowUnsignedApprovalsForTests?: boolean`; reject unsigned approval responses when no signing secret is configured and the test flag is not set. In `createCliDeps`, replace `defaultDecision: 'approved'` with a rejection/abort default unless a named explicit development override is present.

Run the focused tests from Step 4.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/franken-orchestrator/src/http/operator-auth.ts packages/franken-orchestrator/src/beasts/http/beast-auth.ts packages/franken-orchestrator/src/http/chat-app.ts packages/franken-orchestrator/src/http/routes/chat-routes.ts packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts packages/franken-orchestrator/src/cli/dep-factory.ts packages/franken-orchestrator/tests/unit/cli/run.test.ts packages/franken-orchestrator/tests/integration/cli/dep-factory-wiring.test.ts packages/franken-governor/src/gateway/approval-gateway.ts packages/franken-governor/src/server/app.ts packages/franken-governor/tests/unit/gateway/approval-gateway-security.test.ts packages/franken-governor/tests/unit/server/app.test.ts
git commit -m "fix: fail closed on chat and approval boundaries"
```

## Task 2: Enforce MCP Schemas And File Containment

**Files:**
- Modify: `packages/franken-mcp-suite/src/shared/server-factory.ts`
- Modify: `packages/franken-mcp-suite/src/shared/server-factory.test.ts`
- Modify: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts`
- Modify: `packages/franken-mcp-suite/src/servers/firewall.ts`
- Modify: `packages/franken-mcp-suite/src/servers/firewall.test.ts`

- [ ] **Step 1: Add red MCP validation tests**

Add tests in `server-factory.test.ts` proving a handler is not called when required properties are missing, property types are wrong, or unknown properties are supplied.

Run:

```bash
cd packages/franken-mcp-suite
npm test -- --run src/shared/server-factory.test.ts
```

Expected: FAIL because `createMcpServer` currently passes raw args to handlers.

- [ ] **Step 2: Implement central schema validation**

Add a `validateToolArguments(tool, args)` helper in `server-factory.ts` that enforces `inputSchema.required`, primitive `type`, object-only arguments, and no extra properties. Return an MCP error result before calling `tool.handler`.

Run the focused test.

Expected: PASS.

- [ ] **Step 3: Add red firewall path containment tests**

In `firewall.test.ts`, configure a project root temp directory and prove `fbeast_firewall_scan_file` rejects `../outside.txt` and absolute paths outside the root before reading the file.

Run:

```bash
cd packages/franken-mcp-suite
npm test -- --run src/servers/firewall.test.ts
```

Expected: FAIL because `scanFile` currently forwards the supplied path to `readFileSync`.

- [ ] **Step 4: Implement root-contained file scanning**

In `firewall-adapter.ts`, resolve the requested path against `process.env.FBEAST_ROOT ?? process.cwd()`, call `realpathSync` on root and target, and reject targets whose real path is not the root or under the root plus path separator. Update `servers/firewall.ts` so the adapter receives the intended root.

Run the focused test.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/franken-mcp-suite/src/shared/server-factory.ts packages/franken-mcp-suite/src/shared/server-factory.test.ts packages/franken-mcp-suite/src/adapters/firewall-adapter.ts packages/franken-mcp-suite/src/servers/firewall.ts packages/franken-mcp-suite/src/servers/firewall.test.ts
git commit -m "fix: enforce mcp input and file boundaries"
```

## Task 3: Add A Real Container Sandbox Path

**Files:**
- Create: `packages/franken-orchestrator/src/beasts/execution/sandbox-policy.ts`
- Create: `packages/franken-orchestrator/src/beasts/execution/docker-container-runtime.ts`
- Modify: `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts`
- Modify: `packages/franken-orchestrator/src/beasts/create-beast-services.ts`
- Modify: `packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts`
- Add: `packages/franken-orchestrator/tests/unit/beasts/execution/docker-container-runtime.test.ts`

- [ ] **Step 1: Add red Docker runtime tests**

Add tests proving the generated Docker invocation includes:

- `run --rm`
- `--network none`
- a workspace mount rooted in the project or prepared sandbox directory
- `-w /workspace`
- no inherited host environment
- only allowlisted env vars from `SandboxPolicy`

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts
```

Expected: FAIL because the file does not exist.

- [ ] **Step 2: Implement sandbox policy and Docker command builder**

Create `sandbox-policy.ts` with a default policy:

```ts
export interface SandboxPolicy {
  readonly image: string;
  readonly network: 'none';
  readonly workspaceHostPath: string;
  readonly workspaceContainerPath: '/workspace';
  readonly envAllowlist: readonly string[];
}

export const DEFAULT_BEAST_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'FRANKENBEAST_RUN_CONFIG',
  'FRANKENBEAST_MODULE_FIREWALL',
  'FRANKENBEAST_MODULE_SKILLS',
  'FRANKENBEAST_MODULE_MEMORY',
  'FRANKENBEAST_MODULE_PLANNER',
  'FRANKENBEAST_MODULE_CRITIQUE',
  'FRANKENBEAST_MODULE_GOVERNOR',
  'FRANKENBEAST_MODULE_HEARTBEAT',
] as const;
```

Create `docker-container-runtime.ts` that converts a `BeastProcessSpec` plus policy into a Docker `BeastProcessSpec` with `command: 'docker'`.

Run the Docker runtime test.

Expected: PASS.

- [ ] **Step 3: Replace the placeholder container executor**

Implement `ContainerBeastExecutor.start`, `stop`, and `kill` using the same repository/log/event behavior as `ProcessBeastExecutor`, but spawn the Docker command produced by `DockerContainerRuntime`. Record executor metadata with `backend: 'docker'`, image, network, and workspace mount.

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beasts/container-beast-executor.test.ts
```

Expected: PASS with mocked supervisor/runtime; no real Docker daemon needed.

- [ ] **Step 4: Wire container services**

Update `create-beast-services.ts` so `executionMode: 'container'` uses the real executor.

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beasts/container-beast-executor.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/sandbox-policy.ts packages/franken-orchestrator/src/beasts/execution/docker-container-runtime.ts packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts packages/franken-orchestrator/src/beasts/create-beast-services.ts packages/franken-orchestrator/tests/unit/beasts/container-beast-executor.test.ts packages/franken-orchestrator/tests/unit/beasts/execution/docker-container-runtime.test.ts
git commit -m "feat: run beast container mode in a no-network sandbox"
```

## Task 4: Tighten Process Mode Defaults

**Files:**
- Modify: `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts`
- Modify: `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`

- [ ] **Step 1: Add red env and cwd tests**

Add tests proving process mode does not inherit `GITHUB_TOKEN`, `OPENAI_API_KEY`, arbitrary `SECRET_*`, or unrelated host environment variables, and rejects a `cwd` outside the configured project root when a root policy is provided.

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beasts/execution/process-supervisor.test.ts
```

Expected: FAIL because process mode currently inherits almost all of `process.env`.

- [ ] **Step 2: Implement allowlisted process env**

Change `ProcessSupervisor` to build child env from `DEFAULT_BEAST_ENV_ALLOWLIST` plus explicit `spec.env`, not from all of `process.env`. Add optional constructor policy for project-root containment and reject escaped `cwd`.

Run the focused test.

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts
git commit -m "fix: stop inheriting host secrets in process mode"
```

## Task 5: Persist Replay Records For LLM And Tool Calls

**Files:**
- Create: `packages/franken-observer/src/replay/replay-record.ts`
- Create: `packages/franken-observer/src/replay/replay-content-store.ts`
- Add: `packages/franken-observer/src/replay/replay-content-store.test.ts`
- Add: `packages/franken-observer/src/replay/deterministic-replayer.test.ts`
- Modify: `packages/franken-observer/src/audit-trail-store.ts`
- Modify: `packages/franken-observer/src/execution-replayer.ts`
- Modify: `packages/franken-observer/src/index.ts`
- Modify: `packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts`
- Modify: `packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts`
- Modify: `packages/franken-orchestrator/src/skills/cli-skill-executor.ts`
- Modify: `packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts`

- [ ] **Step 1: Add red observer replay tests**

Add tests proving replay records persist raw content by hash, refuse hash mismatches, and can replay a saved LLM response without calling a live provider.

Run:

```bash
cd packages/franken-observer
npm test -- --run src/replay/replay-content-store.test.ts src/replay/deterministic-replayer.test.ts
```

Expected: FAIL because replay record support does not exist.

- [ ] **Step 2: Implement replay record storage**

Add versioned records for `llm.request`, `llm.response`, `tool.call`, `tool.result`, and `environment.snapshot`. Store large content in `.fbeast/audit/blobs/<sha256>` and store manifests next to audit trails.

Run the observer replay tests.

Expected: PASS.

- [ ] **Step 3: Wire orchestrator LLM and tool capture**

Record provider name, model name where available, prompt/input hash, response/output hash, tool name, tool args hash, result hash, and environment snapshot hash through `AuditObserverAdapter`.

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/franken-observer/src/replay/replay-record.ts packages/franken-observer/src/replay/replay-content-store.ts packages/franken-observer/src/replay/replay-content-store.test.ts packages/franken-observer/src/replay/deterministic-replayer.test.ts packages/franken-observer/src/audit-trail-store.ts packages/franken-observer/src/execution-replayer.ts packages/franken-observer/src/index.ts packages/franken-orchestrator/src/adapters/audit-observer-adapter.ts packages/franken-orchestrator/src/adapters/cli-llm-adapter.ts packages/franken-orchestrator/src/skills/cli-skill-executor.ts packages/franken-orchestrator/tests/unit/adapters/cli-llm-adapter.test.ts packages/franken-orchestrator/tests/unit/skills/cli-skill-executor.test.ts
git commit -m "feat: persist deterministic replay records"
```

## Task 6: Persist Beast Phase State Machine

**Files:**
- Modify: `packages/franken-orchestrator/src/beast-loop.ts`
- Modify: `packages/franken-orchestrator/src/context/franken-context.ts`
- Add: `packages/franken-orchestrator/tests/unit/beast-loop-state-persistence.test.ts`
- Modify: `packages/franken-orchestrator/tests/unit/beast-loop.test.ts`

- [ ] **Step 1: Add red state persistence tests**

Add a test that runs a Beast loop with fake ports and asserts a persisted state transition exists after ingestion, hydration, planning, execution, and closure.

Run:

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beast-loop-state-persistence.test.ts tests/unit/beast-loop.test.ts
```

Expected: FAIL because phase state only lives in memory.

- [ ] **Step 2: Implement persisted transition snapshots**

Extend `FrankenContext` with a serializable state-machine snapshot type containing run id, phase, previous phase, timestamp, plan version, task statuses, provider, and last audit event id. Persist after each phase via the observer adapter or a dedicated state store under `.fbeast/state/<runId>.jsonl`.

Run the focused tests.

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/franken-orchestrator/src/beast-loop.ts packages/franken-orchestrator/src/context/franken-context.ts packages/franken-orchestrator/tests/unit/beast-loop-state-persistence.test.ts packages/franken-orchestrator/tests/unit/beast-loop.test.ts
git commit -m "feat: persist beast phase state transitions"
```

## Task 7: Document Claim Boundaries And Re-Audit

**Files:**
- Create: `docs/adr/033-agent-runtime-sandbox-and-replay.md`
- Modify: `docs/guides/run-cli-beast.md`
- Modify: `docs/audits/agent-systems-audit-2026-04-28.md`
- Modify: `tasks/audit-gap-fill-plan-progress.md`
- Modify: `tasks/todo.md`

- [ ] **Step 1: Write the ADR**

Document the exact implemented boundary model:

- process mode is not a hard sandbox, but has env allowlisting and cwd containment
- container mode uses Docker with no network and explicit mounts
- Firecracker/gVisor is still a future backend unless implemented in this task set
- replay records can deterministically replay stored LLM/tool outputs and verify hashes
- OS-level execution replay is limited to captured records and state snapshots

- [ ] **Step 2: Update the user guide**

Add operator instructions for running Beast container mode, expected Docker prerequisites, how network denial works, where replay artifacts live, and how to inspect them.

- [ ] **Step 3: Update the audit follow-up**

Add a `Follow-Up Implementation Status` section to `docs/audits/agent-systems-audit-2026-04-28.md` with each original gap mapped to fixed, partially fixed, or still open.

- [ ] **Step 4: Run the focused verification matrix**

```bash
cd packages/franken-orchestrator
npm test -- --run tests/integration/chat/chat-routes.test.ts tests/unit/cli/run.test.ts tests/integration/cli/dep-factory-wiring.test.ts tests/unit/beasts/execution/process-supervisor.test.ts tests/unit/beasts/execution/docker-container-runtime.test.ts tests/unit/beasts/container-beast-executor.test.ts tests/unit/beast-loop-state-persistence.test.ts tests/unit/adapters/cli-llm-adapter.test.ts tests/unit/skills/cli-skill-executor.test.ts
npm run typecheck

cd ../franken-mcp-suite
npm test -- --run src/shared/server-factory.test.ts src/servers/firewall.test.ts
npm run typecheck

cd ../franken-governor
npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/server/app.test.ts
npm run typecheck

cd ../franken-observer
npm test -- --run src/replay/replay-content-store.test.ts src/replay/deterministic-replayer.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts
npm run typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/033-agent-runtime-sandbox-and-replay.md docs/guides/run-cli-beast.md docs/audits/agent-systems-audit-2026-04-28.md tasks/audit-gap-fill-plan-progress.md tasks/todo.md
git commit -m "docs: map audit gaps to implemented controls"
```

## Open Items After This Plan

- OIDC/downscoped cloud-token support is deliberately not mixed into the sandbox/replay patch set. Create a separate spec after Task 7 for `CredentialIssuer` interfaces and provider-specific OIDC exchanges.
- A gVisor or Firecracker backend should be added behind the container runtime interface if the product needs micro-VM claims. Docker `--network none` is useful but should not be marketed as micro-VM isolation.
- A separate restricted monitor process can build on the same sandbox policy, MCP validation, and replay record streams. Do not claim an independently permissioned monitor agent until that process owns enforcement of spawn, network, filesystem, and token decisions.

## Self-Review

- Spec coverage: every concrete audit bottom-line gap is mapped to a task or an explicit open item.
- Placeholder scan: no placeholder markers, vague edge-case directives, or unspecified test commands remain.
- Type consistency: the plan uses the existing `BeastProcessSpec`, `BeastRun`, `BeastRunAttempt`, `TransportSecurityService`, and Hono middleware patterns already present in the repo.
