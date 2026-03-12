# Frankenbeast Main Functionality Gap Report

**Date:** 2026-03-10

## Scope

This report compares:

- the current repo implementation
- the intended system behavior described in `docs/RAMP_UP.md`, `docs/ARCHITECTURE.md`, package ramp-up docs, and root guides
- active plans in `docs/plans/` only

Completed plans under `docs/plans/complete/` were treated as done and excluded from the "needs to be done" list except where the current code or verification clearly contradicts earlier claims.

## Sources Reviewed

- Root docs: `docs/RAMP_UP.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/NEXT_TO_PLAN.md`, `docs/cli-gap-analysis.md`, `docs/issues/AUDIT-2026-03-08.md`, selected issue docs
- Package docs: package `RAMP_UP.md`, `README.md`, selected `project-outline.md` / `IMPLEMENTATION_PLAN.md`
- Code: package `src/` trees, especially `franken-orchestrator`, `franken-heartbeat`, `franken-mcp`, `frankenfirewall`, `franken-comms`, `franken-web`
- Active plans in `docs/plans/`

## Verification Snapshot

Commands run on 2026-03-10:

- `npm run typecheck`
- `npm test`
- `npm --workspace franken-comms run start:network`

Result:

- `npm run typecheck`: passed across all workspace packages
- `npm test`: failed in `franken-orchestrator`
  - current failure: `packages/franken-orchestrator/tests/unit/cli/dep-factory-providers.test.ts`
  - failing case: unknown provider handling times out instead of failing fast with the expected error
- `npm --workspace franken-comms run start:network`: failed
  - current failure: `MODULE_NOT_FOUND`
  - missing target: `packages/franken-comms/dist/server/start-comms-server.js`

That means the repo is close to green, but it is not fully green right now.

## Executive Summary

Frankenbeast's biggest gap is no longer "missing modules." The modules mostly exist. The biggest gap is that the main local Beast path still does not run through the real module stack it claims to orchestrate.

In practice today:

- the library packages are mostly real and reasonably mature
- the orchestrator has a lot of real infrastructure: CLI providers, Martin loop, chunk sessions, issue workflow, chat server, network operator, dashboard wiring
- the dashboard is real for chat and basic network control
- external comms transport exists
- MCP primitives exist

But the main Beast execution path is still only partially "Frankenbeast" in the full architectural sense:

- firewall is stubbed in the local CLI dep factory
- memory is stubbed
- skill registry is synthetic and chunk-file-derived
- critique is stubbed
- governor is stubbed
- heartbeat is stubbed
- MCP is not wired into the main local execution path

So the core product gap is integration fidelity, not raw module count.

## What Is Functionally Current

### Core modules

| Module | Current functional state | Main gap |
|---|---|---|
| `frankenfirewall` | Real library and HTTP service. Inbound/outbound pipeline exists. Claude/OpenAI/Ollama adapters are implemented and tested. | `GeminiAdapter` and `MistralAdapter` are still exported TODO shells. Main Beast CLI path does not use the real firewall. |
| `franken-skills` | Real skill discovery, validation, local override loading, registry API. | Main Beast CLI path does not use it; orchestrator still synthesizes `cli:*` skills from chunk filenames. |
| `franken-brain` | Real working, episodic, semantic memory layers, compression, lesson extraction, PII decorators. | Main Beast CLI path does not hydrate or persist through it. Error-awareness injection plan is still not landed. |
| `franken-planner` | Real DAG planner package with linear/parallel/recursive strategies, CoT gate, HITL export/modify, recovery loop. | Orchestrator planning still relies on the older `chunk-validator`/`chunk-remediator` path; the stronger plan-critique system is still pending. |
| `franken-observer` | Real tracing, cost tracking, evals, exporters, trace viewer. This is one of the most complete packages. | No major structural gap at package level; main issue is downstream adoption and one stale docs/progress story. |
| `franken-critique` | Real evaluator pipeline and critique loop package. | Main Beast CLI path still replaces it with `stubCritique`. |
| `franken-governor` | Real triggers, channels, approval gateway, security, audit, server. | Main Beast CLI path still replaces it with `stubGovernor`. |
| `franken-heartbeat` | Real heartbeat library/orchestrator package. | Standalone CLI is stub-backed, and Beast CLI closure path still uses `stubHeartbeat`. |

### Supporting packages

| Package | Current functional state | Main gap |
|---|---|---|
| `franken-types` | Stable shared type package; actively used. | Needs to absorb more planning types if the plan-critique design lands. |
| `franken-mcp` | Real client, stdio transport, config loading, constraint merge, good test coverage. | Public API is incomplete, no registry abstraction exists, and the main Beast path does not wire MCP in. |
| `franken-orchestrator` | Real BeastLoop scaffold, CLI, chunk execution stack, issue workflow, chat runtime, chat server, network operator, chunk sessions, provider registry, PR creation. | Still the main architectural bottleneck because the local dep factory stubs most sibling modules. Also currently owns the only red test in the workspace. |
| `franken-comms` | Real comms gateway package with Slack/Discord/Telegram/WhatsApp adapters, routers, signatures, and tests. | Not yet elevated into a full operator setup/init workflow, and its network startup path is currently broken: `npm --workspace franken-comms run start:network` fails because `dist/server/start-comms-server.js` is missing. |
| `franken-web` | Real dashboard shell with live chat and basic network control UI. | Most routes are placeholders: Beasts, Sessions, Analytics, Costs, Safety, Settings. |

## The Main System Gap

### 1. The Beast Loop is only partially real in local execution

This is the most important gap in the repo.

The local CLI path in `packages/franken-orchestrator/src/cli/dep-factory.ts` still uses:

- `stubFirewall`
- `stubMemory`
- synthetic `createStubSkills()`
- `stubPlanner`
- `stubCritique`
- `stubGovernor`
- `stubHeartbeat`

What is real in that path:

- provider registry and CLI adapters
- `CliLlmAdapter`
- `CliObserverBridge`
- `CliSkillExecutor`
- `MartinLoop`
- `GitBranchIsolator`
- checkpointing
- chunk-session persistence and compaction
- PR creation

This means the system is strongest today as an execution shell around CLI agents, not yet as the full deterministic 8-module Beast Loop described in root architecture docs.

### 2. Module packages exist, but orchestration fidelity is not there

The repo has mostly crossed the "can we build these modules?" threshold.

It has not fully crossed the "does the main user path actually compose the modules together?" threshold.

That distinction matters because the main value proposition of Frankenbeast is not just individual packages. It is enforced composition:

- deterministic firewalling
- memory-informed planning and execution
- critique before execution
- governance on risky actions
- heartbeat feedback at closure
- skill/MCP routing with preserved constraints

Today that end-to-end story is still only partially true.

### 3. The chat surface is real, but it is not yet a true Beast dispatch surface

This became clearer on the second pass.

What exists today:

- `frankenbeast chat`
- `frankenbeast chat-server`
- dashboard chat over HTTP + WebSocket
- intent routing, tier selection, and approval UI/state

What is still lightweight rather than full Beast execution:

- `ChatAgentExecutor` currently just calls `llm.complete(userInput)`
- chat execution returns empty `filesChanged` and `testsRun`
- chat approvals are handled inside the chat runtime rather than via the real governor module
- approval resolution clears pending state, but it does not resume a paused durable Beast run
- the HTTP app exposes chat and network routes, but no Beast-dispatch API yet

So chat is a real operator-facing surface, but it is not yet the durable Beast control plane described by the Beasts dispatch plans.

## Package-by-Package Gaps That Still Matter

### MOD-01 `frankenfirewall`

Current:

- real pipeline
- real server
- real core adapters: Claude, OpenAI, Ollama

Needs:

- stop exporting TODO adapters or implement them
- wire the real firewall into the local Beast CLI path
- align docs with actual supported adapter surface

### MOD-02 `franken-skills`

Current:

- registry package is real

Needs:

- replace synthetic chunk-file skill discovery in CLI execution
- preserve `requires_hitl` and other constraint metadata end to end
- integrate real skills into execution routing

### MOD-03 `franken-brain`

Current:

- memory stack is real

Needs:

- wire real hydration/frontload/trace recording into Beast CLI
- land the planned error-awareness / anti-pattern memory injection behavior
- make memory a real decision input rather than mostly dormant package code

### MOD-04 `franken-planner`

Current:

- core planning package is real
- orchestrator has chunk decomposition, validation, remediation, and graph builders

Needs:

- replace the current structural `chunk-validator` / `chunk-remediator` approach with the planned plan-critique system
- raise planning quality from "structurally valid" to "operator-grade runnable plan"

### MOD-05 `franken-observer`

Current:

- highly functional
- used in the local CLI path through `CliObserverBridge`

Needs:

- mostly integration and product surfacing work: dashboard analytics, Beast dispatch telemetry, operator reporting

### MOD-06 `franken-critique`

Current:

- real package

Needs:

- wire it into the Beast CLI path for actual plan/output review
- distinguish package-level critique from the newer plan-critique-system work in orchestrator planning

### MOD-07 `franken-governor`

Current:

- real package

Needs:

- wire actual approval checks into local execution
- preserve hitl requirements from real skill contracts and future MCP tools

### MOD-08 `franken-heartbeat`

Current:

- real library flow

Needs:

- stop presenting standalone CLI as more real than it is
- wire real heartbeat behavior into Beast closure
- connect it to actual module data sources instead of canned CLI stubs

### `franken-mcp`

Current:

- useful implementation primitives exist

Needs:

- export the client/config/transport surface from package root
- implement the missing registry story
- wire `IMcpModule` into orchestrator execution

### `franken-comms`

Current:

- real package with working adapters and signature handling

Needs:

- make the network-managed startup path actually executable
- make it part of a coherent initialization and operator-control story
- clarify default deployment and management path through `network` and future `init`
- align operator config with actual package capability; the comms package supports Telegram and WhatsApp, but current orchestrator network config only exposes Slack and Discord

### `franken-web`

Current:

- live chat UI
- live network status/config surface
- improved shell and routing foundation

Needs:

- real Beasts dispatch surface
- real settings / agent configuration
- real analytics / cost / safety pages
- session history / operator run management

## Active Plans: What They Cover Versus Current Reality

### Already partially landed in code, but not "finished platform-wide"

These plans map to work that is visibly in progress or partially present already:

- `2026-03-08-dashboard-implementation-plan.md`
  - partially landed: `franken-web` exists, chat works, network page exists
  - not landed: full observability/product analytics/control-plane scope
- `2026-03-10-dashboard-ux-refresh-design.md`
- `2026-03-10-dashboard-ux-refresh-implementation-plan.md`
  - partially landed already: mobile drawer, footer version placement, Beasts nav placeholder, calmer shell
- `2026-03-10-network-up-health-gating-design.md`
- `2026-03-10-network-up-health-gating-implementation-plan.md`
  - appears largely or fully landed in current codebase; `network-supervisor` tests passed during this audit

### Landed enough to affect the architecture story, but easy to overstate

- chat/dashboard chat is live, but still separate from the future durable Beast run model
- network control routes are live from the chat server, but they currently cover chat/network operations only
- comms package capability is ahead of network-control/config exposure

### Clearly not landed yet, and still represent real product gaps

- `2026-03-09-dashboard-agent-configuration-implementation-plan.md`
  - still needed; current dashboard `Settings` route is placeholder
- `2026-03-09-init-workflow-implementation-plan.md`
  - still needed; there is no `init` command or unified bootstrap workflow
- `2026-03-09-llm-error-awareness-memory-injection-plan.md`
  - still needed; no central deduped error-awareness rule injection is evident
- `2026-03-09-plan-critique-system-design.md`
- `2026-03-09-plan-critique-system-implementation-plan.md`
  - still needed; current code still uses `chunk-validator.ts` and `chunk-remediator.ts`
- `2026-03-10-beasts-dispatch-design.md`
- `2026-03-10-beasts-dispatch-implementation-plan.md`
  - still needed; current dashboard has only a Beasts placeholder route and no durable Beast run model
- `2026-03-10-work-command-design.md`
- `2026-03-10-work-command-implementation-plan.md`
  - still needed; current CLI has `issues`, `plan`, `run`, `chat`, `network`, but no `work`

### Proposed but structurally not started

These are not duplicates of current platform behavior; they would add new capability:

- `2026-03-08-file-store-integrations-implementation-plan.md`
  - no `franken-files` package exists
- `2026-03-08-productivity-integrations-implementation-plan.md`
  - no `franken-productivity` package exists

## Docs and Truth Gaps

There is still documentation drift.

Examples:

- `docs/PROGRESS.md` claims all tests pass; current audit found one orchestrator test failure
- `docs/cli-gap-analysis.md` says all CLI gaps are closed, but the more fundamental stubbed-module gap remains real
- some docs still describe broader module integration than the local execution path actually delivers
- `docs/guides/quickstart.md` still references nonexistent root scripts like `build:all` and `test:all`, and it describes the old non-workspaces layout rather than the current `packages/*` monorepo shape

This matters because the repo has moved from "missing implementation" toward "truth maintenance" as a serious engineering concern.

## Priority Order

### Priority 0: Make the main Beast path actually be Frankenbeast

Do these before broadening the product surface further:

1. Replace CLI dep-factory stubs with real adapters for firewall, memory, critique, governor, heartbeat, and skill registry.
2. Wire real skill metadata and MCP routing into execution.
3. Keep docs honest about what is real during that transition.

Without this, the product keeps adding shells around a partially simulated core.

### Priority 1: Improve planning and work orchestration

Next most valuable:

1. Land the plan-critique system.
2. Land the `work` command.
3. Make issue-sourced work, local plans, and execution isolation part of one coherent lifecycle.

This would turn the existing pieces into a much stronger operator workflow.

### Priority 2: Build the operator control plane

After the core path is real:

1. Beasts dispatch station
2. dashboard agent configuration
3. init workflow
4. dashboard analytics / cost / safety / session surfaces

These make the system operable, but they should sit on a truthful backend.

### Priority 3: Expand connectors

After the core product loop is solid:

1. file-store integrations
2. productivity integrations
3. further comms/operator setup hardening

These are valuable, but they are expansion work, not core-loop completion work.

## Bottom Line

Frankenbeast today is best described as:

- a strong set of mostly real module packages
- a surprisingly capable orchestrator shell
- a real chat/dashboard/network/operator foundation
- but not yet a fully honest end-to-end Beast Loop in the main local path

If the question is "what remains to make the main functionality real?" the answer is:

1. stop bypassing the real modules in the local Beast path
2. replace synthetic skill execution with real registry + MCP-aware routing
3. strengthen plan quality and work orchestration
4. only then finish the larger operator-control-plane plans around Beasts, Settings, and Init

That is the shortest path from "many implemented parts" to "the core Frankenbeast actually works as advertised."
