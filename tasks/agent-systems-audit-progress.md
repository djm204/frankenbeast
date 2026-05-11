# Agent Systems Audit Progress

## Acceptance Criteria

- [x] Verify secure code execution claims from live source and tests, including process/container execution, raw shell exposure, sandboxing, and network controls.
- [x] Verify deterministic state management claims from live source and tests, including checkpointing, DAG/state-machine structure, replay, memory/versioning, and trace persistence.
- [x] Verify identity boundary claims from live source and tests, including scoped credentials, approvals, HITL gates, and infrastructure-enforced permissions.
- [x] Verify observer/monitor claims from live source and tests, including audit trail behavior, hash chaining, critique/monitor separation, and policy enforcement.
- [x] Run focused commands that exercise the relevant tests or static source searches and record the evidence.
- [x] Document legitimate implemented capabilities and concrete gaps with file/test references.

## Findings Draft

- Audit artifact: `docs/audits/agent-systems-audit-2026-04-28.md`.
- Major verified gaps: no real sandbox runtime, host process execution, container executor placeholder, no process network air-gap, MCP schemas not centrally enforced, partial checkpoint/replay, unauthenticated chat HTTP routes, non-interactive HITL auto-approval, no OIDC/downscoped tokens, monitor/observer components are not an independently restricted enforcement agent.

## Verification

- `cd packages/franken-orchestrator && npm test -- --run tests/unit/beasts/execution/process-supervisor.test.ts tests/unit/beasts/container-beast-executor.test.ts tests/unit/file-checkpoint-store.test.ts tests/unit/cli/run.test.ts` passed: 4 files, 54 tests.
- `cd packages/franken-observer && npm test -- --run src/audit-event.test.ts src/audit-trail-store.test.ts src/execution-replayer.test.ts src/incident/LoopDetector.test.ts src/cost/CircuitBreaker.test.ts` passed: 5 files, 49 tests.
- `cd packages/franken-mcp-suite && npm test -- --run src/shared/server-factory.test.ts src/servers/firewall.test.ts src/servers/governor.test.ts src/servers/observer.test.ts src/adapters/observer-adapter.test.ts src/cli/hook-scripts.test.ts` passed: 6 files, 13 tests.
- `cd packages/franken-governor && npm test -- --run tests/unit/gateway/approval-gateway-security.test.ts tests/unit/security/session-token-store.test.ts tests/unit/security/signature-verifier.test.ts tests/integration/full-approval-flow.test.ts` passed: 4 files, 22 tests.
- `cd packages/franken-orchestrator && npm test -- --run tests/integration/chat/chat-routes.test.ts tests/integration/chat/ws-chat-auth.test.ts tests/integration/beasts/beast-security.test.ts tests/integration/beasts/agent-routes.test.ts tests/unit/comms/security/slack-signature.test.ts tests/unit/comms/slack-router.test.ts` passed: 6 files, 50 tests.
- `cd packages/franken-governor && npm test -- --run tests/unit/server/app.test.ts tests/unit/gateway/approval-gateway-security.test.ts tests/unit/security/session-token.test.ts tests/unit/security/session-token-store.test.ts` passed: 4 files, 26 tests.

## Review

- 2026-04-28: Documented verified agent-systems capabilities and gaps in `docs/audits/agent-systems-audit-2026-04-28.md`.
