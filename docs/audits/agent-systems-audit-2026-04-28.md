# Agent Systems Audit: Secure, Deterministic, Bounded AI Systems

Date: 2026-04-28

Scope: live source and focused tests in `franken-orchestrator`, `franken-mcp-suite`, `franken-governor`, `franken-observer`, `franken-planner`, and `franken-critique`. This audit intentionally does not treat docs/ADRs as proof unless the implementation and tests back them.

## Executive Summary

Frankenbeast legitimately implements several useful production-agent primitives: phased orchestration, prompt-injection scanning, checkpoint files, DAG planning in the planner package, audit/event persistence, hash-chained MCP audit rows, observer replay summaries, cost and loop detectors, HITL approval gateways, signed approval support, session tokens, Beast API operator-token auth, and WebSocket session tokens.

It does not yet meet the stronger systems-engineering bar described in the prompt. The largest gaps are:

- No real execution sandbox: no Firecracker, gVisor, Wasm, seccomp, network namespace, or container runtime is implemented.
- The live Beast executor uses raw host process spawning with inherited environment and caller-controlled working directories.
- Container execution exists only as a throwing placeholder.
- Tool schemas are advertised in MCP metadata but not enforced centrally with Zod/Pydantic-style validation.
- Network air-gapping is not implemented for spawned agent processes.
- Several safety controls are advisory/logging-only rather than infrastructure-enforced.
- HTTP chat approval routes are unauthenticated, and non-interactive CLI governor wiring can auto-approve.
- Replay reconstructs timelines from audit events; it does not deterministically re-execute an agent from saved prompts, responses, tool inputs, and environment snapshots.

## Pillar 1: Secure Code Execution

### Implemented And Verified

- Beast run execution is explicit and supervised through `ProcessSupervisor`, which records stdout/stderr/exit callbacks and supports SIGTERM/SIGKILL cleanup. Evidence: `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts:44`, `:50`; tests in `packages/franken-orchestrator/tests/unit/beasts/execution/process-supervisor.test.ts`.
- Spawned Beast runs persist status, attempts, logs, and config snapshots. Evidence: `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts:45`, `:71`, `:144`.
- Some HTTP run creation surfaces validate bodies with Zod before dispatch. Evidence: `packages/franken-orchestrator/src/http/routes/beast-routes.ts:27`, `packages/franken-orchestrator/src/beasts/services/beast-dispatch-service.ts:44`.
- Codex/Gemini/Claude hook scripts can perform a pre-tool governor check and post-tool observer logging. Focused MCP hook tests passed.

### Gaps

- **No micro-VM, gVisor, Wasm, seccomp, or namespace sandbox exists in live code.** Focused source search found no Firecracker/gVisor/Wasm implementation. The actual Beast executor calls Node `spawn(spec.command, [...spec.args])`. Evidence: `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts:44`.
- **Container mode is not implemented.** `ContainerBeastExecutor` throws for `start`, `stop`, and `kill`. Evidence: `packages/franken-orchestrator/src/beasts/execution/container-beast-executor.ts:6`, `:10`, `:14`; test coverage passed in `container-beast-executor.test.ts`.
- **Execution is on the host with broad environment inheritance.** `ProcessSupervisor` strips only `CLAUDE*` variables, then merges the rest of `process.env` into the child process. Evidence: `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts:21`, `:46`.
- **Workspaces are not ephemeral sandboxes.** Runtime config is written under `.fbeast/.build/run-configs`, and normal execution uses configured project roots rather than disposable filesystems. Evidence: `packages/franken-orchestrator/src/beasts/execution/process-beast-executor.ts:45`.
- **Network air-gapping is not enforced for spawned processes.** There is URL/domain middleware, but not OS-level network isolation. Some domain checks log instead of block. Evidence: `packages/franken-orchestrator/src/middleware/domain-allowlist.ts:53`; tests cover logging-only behavior.
- **MCP tool schemas are metadata, not enforced validation.** `createMcpServer` passes raw `args` into handlers. Handlers commonly coerce with `String(args['...'])`. Evidence: `packages/franken-mcp-suite/src/shared/server-factory.ts:49`, `:63`; examples in `packages/franken-mcp-suite/src/servers/firewall.ts:25`, `:50`.
- **File scanning can read arbitrary supplied paths.** `fbeast_firewall_scan_file` forwards the caller's path to `readFileSync` without a repository/root containment check. Evidence: `packages/franken-mcp-suite/src/adapters/firewall-adapter.ts:42`.

## Pillar 2: Deterministic State Management

### Implemented And Verified

- The Beast loop is a deterministic phase pipeline at the orchestration level: ingestion, hydration, planning, execution, closure. Evidence: `packages/franken-orchestrator/src/beast-loop.ts:45`, `:53`, `:61`, `:74`, `:90`.
- Execution respects task dependencies with a simple topological loop and a max-iteration guard. Evidence: `packages/franken-orchestrator/src/phases/execution.ts:61`, `:67`, `:88`.
- Checkpoint files skip already-completed tasks and record per-task commit hashes for recovery. Evidence: `packages/franken-orchestrator/src/phases/execution.ts:103`, `:129`, `packages/franken-orchestrator/src/checkpoint/file-checkpoint-store.ts:32`, `:36`.
- The planner package has an immutable `PlanGraph` with topological sort and version incrementing on fix-it task insertion. Evidence: `packages/franken-planner/src/core/dag.ts:13`, `:65`, `:115`, `:131`.
- Observer audit trails persist to `.fbeast/audit/<runId>.json`, and `ExecutionReplayer` reconstructs phase/provider/error timelines from events. Evidence: `packages/franken-observer/src/audit-trail-store.ts:23`, `packages/franken-observer/src/execution-replayer.ts:41`.
- MCP observer rows are hash-chained through `parent_hash`. Evidence: `packages/franken-mcp-suite/src/adapters/observer-adapter.ts:64`, `:74`, `:76`, `:165`; tests passed in `src/adapters/observer-adapter.test.ts`.

### Gaps

- **Checkpointing is partial, not full state-machine persistence.** The file checkpoint records done markers and commit hashes, not the complete prompt, response, tool input/output, environment, model version, or process state required to replay an agent deterministically. Evidence: `packages/franken-orchestrator/src/checkpoint/file-checkpoint-store.ts:5` through `:45`.
- **The main Beast loop is phased but not modeled as a persisted finite-state machine.** Phase transitions are in memory on `ctx.phase`; state is not persisted after every node. Evidence: `packages/franken-orchestrator/src/beast-loop.ts:34`, `packages/franken-orchestrator/src/context/franken-context.ts:28`.
- **Replay is timeline analysis, not deterministic execution replay.** `ExecutionReplayer` groups existing audit events; it does not re-run tool calls or LLM responses from stored inputs. Evidence: `packages/franken-observer/src/execution-replayer.ts:42`, `:60`, `:80`.
- **LLM prompts and responses are not universally persisted into the observer audit trail.** Some tests create synthetic `llm.request`/`llm.response` audit events, and token spend is collected, but the live `BeastLoop` mostly records high-level audit summaries and spans. Evidence: `packages/franken-orchestrator/src/phases/planning.ts:56`, `:81`; `packages/franken-orchestrator/src/phases/execution.ts:133`, `:310`.
- **Memory is persisted, but not fully versioned by semantic category in a production database model.** The MCP suite schema has a generic `memory` table with `type`, and `brain-adapter` has working/episodic behavior, but this is not a strict short-term/long-term/episodic versioned memory architecture. Evidence: `packages/franken-mcp-suite/src/shared/sqlite-store.ts:8`, `packages/franken-mcp-suite/src/adapters/brain-adapter.ts:55`.

## Pillar 3: Identity Boundaries

### Implemented And Verified

- Beast-control HTTP routes enforce an operator token with timing-safe comparison. Evidence: `packages/franken-orchestrator/src/beasts/http/beast-auth.ts:21`, `:27`; route mounting in `packages/franken-orchestrator/src/http/routes/beast-routes.ts:66`; tests passed in `tests/integration/beasts/beast-security.test.ts`.
- WebSocket chat tokens are scoped to `chat-session` and the session id, with optional origin allowlisting. Evidence: `packages/franken-orchestrator/src/http/ws-chat-auth.ts:31`, `:49`; `packages/franken-orchestrator/src/http/security/transport-security.ts:49`, `:88`; tests passed in `tests/integration/chat/ws-chat-auth.test.ts`.
- Governor approvals support signed responses and short-lived session tokens when configured. Evidence: `packages/franken-governor/src/gateway/approval-gateway.ts:42`, `:108`; `packages/franken-governor/src/security/session-token-store.ts:3`; focused governor tests passed.
- Comms Slack signatures are enforced by default in orchestrator comms routes. Evidence: `packages/franken-orchestrator/src/comms/channels/slack/slack-router.ts:18`.

### Gaps

- **No OIDC/downscoped cloud-token implementation was found.** The repo has local session tokens and operator tokens, but no source-level OIDC/OpenID/id-token implementation.
- **HTTP chat routes are unauthenticated.** Session creation, session reads, message submission, and approval update endpoints are mounted without operator/session auth. Evidence: `packages/franken-orchestrator/src/http/routes/chat-routes.ts:49`, `:71`, `:78`, `:114`; tests pass approval without an auth header at `packages/franken-orchestrator/tests/integration/chat/chat-routes.test.ts:348`.
- **Non-interactive CLI can auto-approve HITL.** In `createCliDeps`, non-TTY mode wires `GovernorPortAdapter` with `defaultDecision: 'approved'`. Evidence: `packages/franken-orchestrator/src/cli/dep-factory.ts:388`, `:393`.
- **Signed approval enforcement is misconfigurable.** `ApprovalGateway` checks signatures only when `requireSignedApprovals` and `signatureVerifier` are both present; `requireSignedApprovals: true` without a verifier silently skips verification. Evidence: `packages/franken-governor/src/gateway/approval-gateway.ts:42`.
- **Governor HTTP server allows unsigned operation when no signing secret is configured.** Evidence: `packages/franken-governor/src/server/app.ts:55`; tests cover unsigned defaults in `packages/franken-governor/tests/unit/server/app.test.ts`.
- **Least privilege is mostly prompt/config discipline, not infrastructure enforcement.** Process working directories and config paths come from run config, and spawned processes inherit broad host credentials. Evidence: `packages/franken-orchestrator/src/beasts/definitions/martin-loop-definition.ts:38`, `packages/franken-orchestrator/src/beasts/execution/process-supervisor.ts:46`.

## Observer / Monitor Pattern

### Implemented And Verified

- `franken-observer` provides traces, spans, token/cost tracking, loop detection, audit trail persistence, and replay summaries. Focused observer tests passed.
- `franken-critique` implements deterministic/LLM evaluators and short-circuits on safety evaluator failures. Evidence: `packages/franken-critique/src/pipeline/critique-pipeline.ts:28`.
- MCP hooks can run a governor check before tool use and observer logging after tool use. Evidence: `packages/franken-mcp-suite/src/cli/hook-scripts.ts`; focused hook tests passed.
- Cost and loop detectors emit signals. Evidence: `packages/franken-observer/src/cost/CircuitBreaker.ts:25`, `packages/franken-observer/src/incident/LoopDetector.ts:20`.

### Gaps

- **There is not a separate, strongly restricted monitor agent enforcing boundaries during worker execution.** Observer/critique/governor are components and hooks, not an independently permissioned monitor process with hard control over filesystem, network, tokens, or process execution.
- **Some observer controls are non-blocking by design.** `CircuitBreaker` emits/checks but tests assert it does not throw when the limit is exceeded. Evidence: `packages/franken-observer/src/cost/CircuitBreaker.test.ts:69`.
- **Governor MCP checks are advisory strings unless a client hook enforces them.** The MCP governor server returns text decisions; enforcement depends on the caller/hook path. Evidence: `packages/franken-mcp-suite/src/servers/governor.ts:16`, `:29`.
- **Critique is part of planning/review, not a universal runtime boundary.** The planning phase calls `critique.reviewPlan`, but direct process execution and many HTTP/chat paths are not mediated by a separate monitor. Evidence: `packages/franken-orchestrator/src/phases/planning.ts:79`, `packages/franken-orchestrator/src/phases/execution.ts:269`.

## Verification Commands Run

All commands exited 0.

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beasts/execution/process-supervisor.test.ts tests/unit/beasts/container-beast-executor.test.ts tests/unit/file-checkpoint-store.test.ts tests/unit/cli/run.test.ts
```

Result: 4 files passed, 54 tests passed.

```bash
cd packages/franken-observer
npm test -- --run src/audit-event.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts src/incident/LoopDetector.test.ts src/cost/CircuitBreaker.test.ts
```

Result: 5 files passed, 49 tests passed.

```bash
cd packages/franken-mcp-suite
npm test -- --run src/shared/server-factory.test.ts src/servers/firewall.test.ts src/servers/governor.test.ts src/servers/observer.test.ts src/adapters/observer-adapter.test.ts src/cli/hook-scripts.test.ts
```

Result: 6 files passed, 13 tests passed.

```bash
cd packages/franken-governor
npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/security/session-token-store.test.ts tests/unit/security/signature-verifier.test.ts tests/integration/full-approval-flow.test.ts
```

Result: 4 files passed, 22 tests passed.

```bash
cd packages/franken-orchestrator
npm test -- --run tests/integration/chat/chat-routes.test.ts tests/integration/chat/ws-chat-auth.test.ts tests/integration/beasts/beast-security.test.ts tests/integration/beasts/agent-routes.test.ts tests/unit/comms/security/slack-signature.test.ts tests/unit/comms/slack-router.test.ts
```

Result: 6 files passed, 50 tests passed.

```bash
cd packages/franken-governor
npm test -- --run tests/unit/server/app.test.ts tests/unit/gateway/approval-gateway-security.test.ts tests/unit/security/session-token.test.ts tests/unit/security/session-token-store.test.ts
```

Result: 4 files passed, 26 tests passed.

## Follow-Up Implementation Status

Updated 2026-05-18 — security-hardening Chunk 2 (ADR-035). See
`docs/adr/035-mcp-input-validation-and-path-containment.md`. (Chunk 1 /
Pillar 3 rows are tracked in its own PR and will appear in this section once
both merge.)

| Pillar 1 gap | Status | Evidence |
|--------------|--------|----------|
| MCP tool schemas are metadata, not enforced validation | **fixed** | Commit `acb7265`; `validateToolArguments` + shared `dispatchTool` gate every tool (SDK CallTool path and in-process `callTool`). Tests: `src/shared/server-factory.test.ts` › "rejects missing required property / wrong type / unknown extra property / passes valid". |
| File scanning can read arbitrary supplied paths | **fixed** | Commit `7085b5c`; `createFirewallAdapter` real-path-contains `scanFile` to the configured project root. Tests: `src/servers/firewall.test.ts` › "rejects scanning a path outside the project root" / "allows scanning a file inside the project root". |

Residual (ADR-035): MCP validation is structural only (no deep JSON-Schema
`format`/`enum`/nested/array-item validation), matching the flat advertised
schema contract.

## Bottom Line

Frankenbeast is strongest today as an orchestration, audit, planning, review, and local-governance framework. It has real observability and some real approval/auth controls.

It is not yet a hardened production agent runtime in the Firecracker/Wasm/downscoped-token/deterministic-replay sense. The production-grade roadmap should prioritize hard sandboxed execution, infrastructure-enforced identity and network boundaries, authenticated chat/HITL routes, fail-closed approval configuration, central tool input validation, and full event-sourced replay records.
