# Architecture map for new agent contributors

Use this map when you have an issue title and need to choose the first files, owners, and verification commands. It summarizes the current implementation surfaces only; historical `MOD-*` names in older diagrams are capability labels, not separate live packages.

## Runtime control-loop map

```text
User / PM handoff
  -> Web dashboard or CLI entrypoint
  -> @franken/orchestrator
       Ingestion: security middleware + memory hydration
       Planning: planner package or orchestrator graph builders
       Execution: skill/provider/MCP dispatch behind approval gates
       Closure: observer records, critique/reflection, PR/issue handoff
  -> Runtime state: .fbeast/beast.db, .fbeast/config.json, .fbeast/.build/**
```

Boundary rule: Start with the package that owns the user-visible symptom, then include shared types or orchestrator adapters only when the data contract crosses a package boundary. Do not edit historical `docs/plans/**` as if they were live code ownership.

Dependency prerequisite: In fresh checkouts without workspace `dist/` outputs, run the dependency-ordered root `npm run build` before package-local tests/typechecks for packages that import other internal workspaces; `--workspace` selects a workspace script but does not build its dependencies first.

## Package-to-responsibility table

| Package/path | Owner entry | Primary / escalation owner | Primary responsibility | Common first files | Focused verification |
| --- | --- | --- | --- | --- | --- |
| `packages/franken-types/` (`@franken/types`) | `types-contracts` | `types-contracts-maintainers` / `core-maintainers` | Shared branded IDs, Result helpers, DTOs, LLM/client contracts, and cross-package schemas. | `src/ids.ts`, `src/llm.ts`, DTO/schema exports. | `npm run build --workspace @franken/types && npm run typecheck --workspace @franken/types` |
| `packages/franken-orchestrator/` (`@franken/orchestrator`) | `orchestrator-runtime` | `orchestrator-maintainers` / `core-maintainers` | Beast Loop runtime, CLI, chat server, dashboard backend, provider adapters, comms gateways, skill execution, checkpoints, and crash recovery. | `src/beast-loop.ts`, `src/deps.ts`, `src/cli/`, `src/http/`, `src/skills/`, `src/phases/`, `src/closure/`. | `npm run build && npm run typecheck --workspace @franken/orchestrator && npm test --workspace @franken/orchestrator` |
| `packages/franken-mcp-suite/` (`@franken/mcp-suite`) | `mcp-suite` | `mcp-maintainers` / `core-maintainers` | `fbeast` CLI, MCP server/proxy registration, hooks, tool adapters, governance gate integration, and local client setup. | `src/cli/`, `src/servers/`, `src/shared/`, hook/setup tests. | `npm run build && npm run test --workspace @franken/mcp-suite` |
| `packages/franken-web/` (`@franken/web`) | `web-dashboard` | `web-maintainers` / `core-maintainers` | React/Vite dashboard UI, chat/session hooks, API clients, accessibility surfaces, and operator controls. | `src/components/`, `src/hooks/`, `src/lib/`, `tests/`. | `npm run typecheck --workspace @franken/web && npm run test --workspace @franken/web && npm run build --workspace @franken/web` |
| `packages/franken-planner/` (`@franken/planner`) | `planner-recovery` | `planner-maintainers` / `core-maintainers` | Task graph planning, DAG/topological validation, recovery ingestion, recursive expansion, and planner integration tests. | `src/planner.ts`, `src/core/dag.ts`, `src/recovery/`, `tests/unit/core/dag.test.ts`, `tests/integration/`. | `npm run test --workspace @franken/planner && npm run test:integration --workspace @franken/planner` |
| `packages/franken-brain/` (`@franken/brain`) | `brain-memory` | `memory-maintainers` / `core-maintainers` | Working/episodic/semantic memory, SQLite persistence, memory snapshots, PII-safe recall, and hydration support. | `src/sqlite-brain.ts`, memory store implementations, serialization tests. | `npm run build --workspace @franken/brain && npm run test --workspace @franken/brain` |
| `packages/franken-observer/` (`@franken/observer`) | `observer-telemetry` | `observer-maintainers` / `core-maintainers` | Traces, token/cost accounting, circuit breakers, exporters, metrics, eval telemetry, and replay evidence. | `src/cost/`, `src/adapters/`, `src/evals/`, trace/export tests. | `npm run build --workspace @franken/observer && npm run typecheck --workspace @franken/observer && npm run test --workspace @franken/observer && npm run test:eval --workspace @franken/observer` |
| `packages/franken-critique/` (`@franken/critique`) | `critique-evaluation` | `critique-maintainers` / `core-maintainers` | Critique/evaluation engines, scoring, review rubrics, and lesson recording. | `src/evaluators/`, `src/types/`, critique pipeline tests. | `npm run build --workspace @franken/critique && npm run test --workspace @franken/critique` |
| `packages/franken-governor/` (`@franken/governor`) | `governor-approval` | `governor-maintainers` / `security-maintainers` | HITL approval gates, policy checks, risky command/tool controls, signed approval endpoints, and approval audit memory. | `src/gateway/`, `src/audit/`, `src/triggers/`, policy tests. | `npm run build --workspace @franken/governor && npm run test --workspace @franken/governor` |
| `packages/live-bench/` (`@franken/live-bench`) | `live-bench` | `benchmark-maintainers` / `core-maintainers` | Live benchmark fixtures, scoring harnesses, and model/tool evaluation experiments. | benchmark fixtures, scoring scripts, live test harnesses. | `npm run test --workspace @franken/live-bench`; run `npm run test:live:bench` only when the change requires live provider/tooling verification. |
| `docs/onboarding/`, `docs/guides/` | `onboarding-docs` | `docs-onboarding-maintainers` / `core-maintainers` | Contributor/operator onboarding, runbooks, architectural decisions, and verification guidance. | `ONBOARDING.md`, `docs/onboarding/RAMP_UP.md`, `docs/ARCHITECTURE.md`, this map, and the focused docs test for the changed file/issue. | Focused root docs test for the touched doc, e.g. `npm run test:root -- tests/docs-issue-1666.test.ts`; add link/script metadata guards when examples reference live commands. |

## Common change recipes

| Ticket wording or symptom | Start in | Also inspect | Verification pattern |
| --- | --- | --- | --- |
| Dashboard, chat UI, accessibility, browser API, visible operator controls | `packages/franken-web/` | `packages/franken-orchestrator/src/http/` when the API response shape changes; `@franken/types` for shared DTOs. | Web typecheck/test/build; add orchestrator route tests if backend contracts changed. |
| CLI command, `frankenbeast` runtime, provider fallback, chunk sessions, issue runner, chat server | `packages/franken-orchestrator/` | `docs/onboarding/RAMP_UP.md`, `docs/CONTRACT_MATRIX.md`, and package-local tests for the touched subdirectory. | Orchestrator build/typecheck/tests plus a focused root docs/metadata test when commands are documented. |
| `fbeast` install/uninstall, MCP hooks, MCP proxy/tool behavior, governance-gate wrapper | `packages/franken-mcp-suite/` | Agent tool threat model and SECURITY docs when tool execution boundaries change. | MCP suite build/tests and any security/docs regression that anchors the behavior. |
| Planner graph ordering, recovery ingestion, recursive chunk expansion, plan rewrites | `packages/franken-planner/` | Orchestrator graph-builder adapters if the runtime consumes the changed planner shape; DAG sources start at `packages/franken-planner/src/core/dag.ts` and `packages/franken-planner/tests/unit/core/dag.test.ts`. | Planner unit tests plus `npm run test:integration --workspace @franken/planner` for runtime graph flows. |
| Memory hydration, stale preferences, snapshots, recall, or PII-safe context | `packages/franken-brain/` | Orchestrator `IMemoryModule` adapter and docs about memory boundaries. | Brain build/tests and adapter tests when the port contract changes. |
| Token cost, traces, SLO/eval telemetry, replay, metrics, circuit breakers | `packages/franken-observer/` | Orchestrator observer bridge and dashboard consumers if fields are displayed; eval runner sources live under `packages/franken-observer/src/evals/`. | Observer build/typecheck/test; add `npm run test:eval --workspace @franken/observer` only for eval behavior changes. |
| HITL approvals, policy triggers, signed approval URLs, risk detection | `packages/franken-governor/` | Orchestrator approval wiring, MCP governance gate, and approval-cop/runbook docs. | Governor build/tests plus integration/docs checks for any changed approval protocol. |
| Cross-package DTO/type/schema change | `packages/franken-types/` | Every importing package named by `docs/CONTRACT_MATRIX.md` and the ownership manifest. | Build `@franken/types` first, then run consuming package typecheck/tests. |
| Onboarding, architecture, runbook, guide, or ADR issue | `docs/onboarding/` or the nearest docs area | Root `README.md` and `ONBOARDING.md` entrypoints so new agents find the doc; match `docs/onboarding/repository-ownership.manifest.json` globs before assigning owners, and use the manifest unknown-path policy for ADR-only work until an ADR owner is added. | Focused root docs test for the touched file/issue; do not reuse `tests/docs-issue-1666.test.ts` for unrelated docs unless that map or its entrypoints changed. |

## Web and orchestrator boundary

`packages/franken-web` owns browser rendering and client-side state. It should call same-origin dashboard/chat APIs through typed clients in `src/lib/` and hooks in `src/hooks/`. `packages/franken-orchestrator` owns the HTTP/WebSocket/SSE server implementation, auth/session validation, daemon process supervision, Beast control APIs, and provider execution.

When a change crosses this boundary:

1. Put shared request/response shapes in `@franken/types` when more than one package needs to compile against them.
2. Add or update orchestrator route tests for server behavior.
3. Add or update web hook/component tests for browser behavior.
4. Run web checks after building shared types if the web package imports generated `dist` exports.

## Approval/HITL boundaries

Approval gates are intentional runtime stops, not UI-only prompts.

- `@franken/governor` owns approval policy, trigger severity, signed approval endpoints, CLI/Slack channel abstractions, and approval audit surfaces.
- `@franken/orchestrator` decides when runtime execution calls the governor, how denied/pending approvals affect Beast Loop phases, and how chat/dashboard surfaces expose that state.
- `@franken/mcp-suite` wraps MCP tool execution with governance gates so external tool calls cannot bypass policy.
- PM-swarm and approval-cop workflows are operational automation around PRs and worker side effects; their docs must preserve exact command evidence, approval tokens, and HITL stop conditions.

If an issue touches force-pushes, merges, destructive cleanup, external webhooks, secret material, or production-affecting commands, stop at the relevant HITL gate instead of weakening policy to make automation proceed.

## Memory boundaries

Frankenbeast has several memory surfaces with different owners:

- Runtime working/episodic/semantic memory lives in `@franken/brain` and is persisted through the project `.fbeast/beast.db` path.
- Shared type projections for memory-shaped data belong in `@franken/types`; do not duplicate incompatible DTOs in consumers.
- Orchestrator hydration and `IMemoryModule` adapters decide which memory is injected into planning/execution context.
- Observer traces, cost records, and eval telemetry are evidence records, not prompt memory. Keep them in `@franken/observer` unless a feature explicitly promotes summarized context through the memory adapter.
- Hermes/Kanban worker lessons under `tasks/` are repository coordination artifacts. They are useful for PR workers, but they are not the same as Frankenbeast runtime memory.

When changing memory behavior, prove both mutation isolation and persistence/reload behavior; stale or mutable memory snapshots can create false context for later agents.

## Related maps to read next

- [Agent ramp-up](RAMP_UP.md) — shortest current package map and Beast Loop notes.
- [Architecture overview](../ARCHITECTURE.md) — detailed diagrams and consolidated package inventory.
- [Data flow](../DATA_FLOW.md) — end-to-end runtime handoff from input to closure artifacts.
- [Contract matrix](../CONTRACT_MATRIX.md) — port/interface boundaries before changing shared contracts.
- [Repository ownership manifest](repository-ownership.md) — owner and escalation mapping for handoffs.
- [Test command decision tree](test-command-decision-tree.md) — narrowest verification gate selector.
