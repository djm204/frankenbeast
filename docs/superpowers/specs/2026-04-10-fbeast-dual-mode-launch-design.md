# fbeast Dual-Mode Launch Design

**Date:** 2026-04-10
**Status:** Approved
**Scope:** First live release that ships both MCP mode and Beast mode, with MCP completed first.

## Goal

Ship `@fbeast/mcp-suite` and Beast mode together without conflating their control planes.

The release must make two things true at the same time:

1. `MCP mode` is a credible Claude Code plugin surface backed by real frankenbeast engines rather than local stand-ins.
2. `Beast mode` is a credible standalone runtime backed by the existing beast control plane, with both dashboard and CLI parity for core operations.

Both modes must share the same `.fbeast/beast.db` state so users can move between them without losing shared memory, persisted planning context, traces, or budget history.

## Product Boundaries

### MCP mode

MCP mode is plugin mode. Claude Code remains the driver and calls `fbeast_*` tools through MCP servers provided by `@fbeast/mcp-suite`.

Responsibilities:

- expose memory, planning, critique, firewall, observer, governor, and skills as MCP tools
- install and uninstall cleanly into Claude Code config
- optionally add hooks for deterministic pre/post tool enforcement
- use shared persistent state in `.fbeast/beast.db`

Non-responsibilities:

- it does not own beast lifecycle management
- it does not become the beast control plane
- it does not replace the standalone orchestrator runtime

### Beast mode

Beast mode is standalone orchestrator mode. Frankenbeast owns the execution loop rather than exposing tools to Claude Code.

Responsibilities:

- start and manage beast runs through the existing beast backend
- use the existing dashboard as the primary human-facing operator surface
- provide CLI parity for users who prefer terminal-first operations
- use the same `.fbeast/beast.db` state as MCP mode where the data models overlap

Non-responsibilities:

- it does not run through the MCP entrypoints
- it does not depend on Claude Code being present

## Control Plane Model

The Beast control plane remains the accepted `beasts-daemon` architecture.

- `dashboard` is the main operator UI
- `CLI` is a first-class peer client for command-line users
- `chat-server` remains another client where applicable
- `beasts-daemon` is the actual backend control plane for beast lifecycle and stateful operations

That means the launch should preserve this topology:

- Dashboard -> `beasts-daemon`
- CLI -> `beasts-daemon`
- chat-server -> `beasts-daemon`

`MCP mode` remains separate from this path. It is a plugin/tool-provider surface, not a beast-control transport.

For launch purposes, `beasts-daemon` refers to the existing Beast control-plane surfaces already present in `franken-orchestrator`, not to a newly introduced standalone binary. The concrete backend contract for this release is:

- `franken-orchestrator` Beast services and repositories remain the single authority for beast lifecycle state
- `/v1/beasts/*` HTTP routes are the dashboard-facing control-plane transport
- CLI Beast operations must call the same underlying Beast services or HTTP control-plane contract rather than reimplementing lifecycle logic in `@fbeast/mcp-suite`
- `chat-server` may act as another client when it uses those same backend surfaces

## Shared State Model

Both modes share `.fbeast/beast.db`, but they do not share process ownership.

Shared data expectations:

- memory entries written in MCP mode are visible to Beast mode
- planning context intentionally persisted into shared stores remains visible across mode switches
- observer traces and cost data remain queryable across both modes
- governor and firewall logs persist across mode switches

For first launch, the shared-state promise does not require transient planner DAGs, design-doc markdown files, or chunk files to be reconstructed from `.fbeast/beast.db`. Only data intentionally persisted into shared stores is covered by the release guarantee.

Isolation expectations:

- enabling or disabling MCP servers must not change beast daemon behavior
- starting or stopping Beast mode must not mutate Claude Code MCP config
- dashboard/CLI beast operations must not depend on MCP server installation

Authority model:

- Claude Code settings remain the source of truth for installed MCP servers and installed hooks
- `.fbeast/config.json` remains the source of truth for local mode selection, Beast provider selection, and persisted risk-acknowledgment fields
- `.fbeast/beast.db` remains the source of truth for shared memory, observer/cost records, and firewall/governor logs
- the Beast control plane remains the source of truth for tracked agents, runs, and other lifecycle state

The “no config drift” release gate means operations only mutate their own authority domain unless a cross-domain write is explicitly part of the contract. Derived views may be recomputed from those sources, but no operation should create competing ownership of the same field.

## Release Sequencing

The release will be built in three phases.

### Phase 1: Complete MCP mode first

This is the first completion target because it is the current gap between public package story and actual behavior.

Required outcomes:

- replace MCP-local stand-in logic with thin adapters over existing franken modules and orchestrator surfaces
- implement a real `fbeast-hook` runtime so `--hooks` installs executable behavior rather than dead config
- add package-level startup smoke tests for installed MCP binaries and basic `tools/list` behavior
- publish user-facing install/docs that match the actual package surface

### Phase 2: Complete Beast mode second

This is the second completion target once MCP mode is credible.

Required outcomes:

- add explicit Beast mode entry from the `fbeast` CLI
- support provider selection for Beast mode
- enforce first-run CLI-risk acknowledgment for `claude-cli` provider
- verify Beast mode reads and writes the same shared `.fbeast` state where intended
- keep dashboard as primary UI while adding CLI parity for core operations

### Phase 3: Dual-mode release gate

This is the final proof stage before launch.

Required outcomes:

- prove fresh install path for MCP mode
- prove Beast mode startup path on the same project
- prove shared state survives switching between the two modes
- prove no config drift between Claude Code config, `.fbeast/config.json`, and Beast control-plane state

## Implementation Constraints

The implementation plan must be broken into logical, PR-able chunks that are friendly to limited context windows.

Each chunk should be:

- small enough to reason about without loading unrelated subsystems
- targeted to one clear behavior change or integration seam
- independently testable with focused verification
- safe to review on its own without needing the entire launch in context

Chunk design rules:

- prefer one adapter family, one CLI surface, or one verification surface per chunk
- keep write scopes narrow and avoid cross-package edits unless the seam requires it
- each chunk must end with a concrete proof point: passing targeted tests, a smoke check, or both
- avoid mega-PRs that combine MCP adapters, hook runtime, Beast CLI, dashboard parity, and docs in one pass
- sequence chunks so each one leaves the repo in a still-working state

## Chunk Map

This design is intentionally executed in eight ordered chunks. The first five chunks make MCP mode release-credible before Beast mode activation work begins. The last three chunks complete Beast mode and prove the dual-mode launch gate.

1. **MCP contract and startup smoke harness**  
   Align the published bin surface, combined server startup, and package-level smoke coverage so the shipped MCP package matches the install story.
2. **Memory, observer, and governor adapters**  
   Replace MCP-local stand-ins for memory, audit/cost, and governance with thin adapters over the existing engines.
3. **Planner and critique adapters**  
   Replace template planning and heuristic critique behavior with real planner and critique integrations.
4. **Firewall, skills, and real hook runtime**  
   Wire firewall and skills to existing orchestrator-backed surfaces and make `fbeast-hook` perform actual pre/post behavior instead of installing dead config.
5. **MCP docs and launch proof**  
   Align docs with the real package surface and prove the combined MCP mode is credible through final smoke assertions.
6. **Beast CLI parity**  
   Add the missing CLI operations against the existing beast control plane so terminal users have the same core operational coverage as dashboard users.
7. **Beast activation and risk acknowledgment**  
   Add `fbeast beast`, persist provider selection intentionally, and gate `claude-cli` behind a one-time risk acknowledgment.
8. **Dual-mode release gate**  
   Prove fresh install, Beast startup, shared-state handoff, and config isolation on the same project before calling the launch ready.

Chunk sequencing invariants:

- Chunks 1 through 5 must land before Beast mode can be considered launch-credible.
- Chunks 6 and 7 complete Beast mode only after MCP mode is already real.
- Chunk 8 is the final launch gate and must verify both modes together rather than in isolation.

## MCP Mode Design

### Server implementation rule

Each MCP server must be a thin wrapper over existing frankenbeast engines or orchestrator services. The MCP package should remain transport and install glue, not a second implementation of the product.

Allowed in `@fbeast/mcp-suite`:

- path translation
- input normalization
- output shaping for MCP
- config/bootstrap helpers
- hook runtime
- integration tests

Not allowed in `@fbeast/mcp-suite`:

- alternate memory engine behavior
- template planner logic standing in for real planner output
- ad hoc critique heuristics replacing critique engine behavior
- regex-only governance or skills logic where existing modules already define the behavior

### Hook design

`fbeast-init --hooks` must only install commands that actually exist in the package.

The `fbeast-hook` runtime should:

- support pre-tool governance checks
- support post-tool observer logging
- fail clearly when configuration is missing
- avoid mutating unrelated Claude settings

Hooks remain opt-in because they are more invasive than plain MCP tools.

Hook runtime contract:

- `pre-tool` receives a tool name plus an optional serialized payload string; missing payload is treated as an empty string
- `post-tool` receives a tool name plus an optional serialized result payload string; missing payload is treated as an empty string
- governance denial in `pre-tool` must exit non-zero and print the denial reason to stderr
- missing `.fbeast` runtime state, unreadable config, or observer/governor bootstrap failure must exit non-zero and print a clear `fbeast-hook` error to stderr
- invalid hook usage must fail with a usage error rather than silently succeeding

### Verification for MCP mode

Minimum proof:

- package builds
- package typechecks
- package unit tests pass
- init/uninstall integration tests pass
- startup smoke tests can spawn each declared MCP binary
- combined `fbeast-mcp` server starts and exposes the expected tool list

## Beast Mode Design

### Runtime entry

`fbeast beast` is the user-facing Beast mode entry.

It should:

- load or initialize `.fbeast/config.json`
- accept provider selection explicitly
- update Beast mode config fields intentionally
- hand off runtime control to existing Beast/orchestrator surfaces rather than reimplementing them in the MCP package

### Provider-risk acknowledgment

For `claude-cli`, the first run must warn clearly that this path may violate provider terms and risk suspension. The warning is acknowledged once and persisted in `.fbeast/config.json`.

This spec intentionally distinguishes only two provider classes for launch:

- `claude-cli`: CLI-automation path that requires the acknowledgment gate
- API-backed providers: providers that call their official remote APIs and do not require this acknowledgment gate

Requirements:

- warning only gates `claude-cli`
- API-backed providers do not require this acknowledgment
- acknowledgment persists and is not re-prompted every run
- refusal aborts Beast mode launch cleanly

Config contract:

- Beast provider selection must be persisted in `.fbeast/config.json`
- the persisted acknowledgment field must be specific to the CLI-risk gate and must not suppress future warnings for unrelated risks
- launch verification must cover at least one `claude-cli` path and at least one API-backed provider path

### CLI parity

Day-one CLI parity for Beast operations is:

- `create`
- `list`
- `logs`
- `stop`
- `restart`
- `resume`
- `delete`

The dashboard remains the primary UI, but no core beast operation should require the dashboard.

Parity semantics for launch:

- `create` starts a new tracked agent or run through the accepted Beast control plane
- `list` returns current tracked agents or runs with enough status information to answer the practical “status” question
- `logs` reads logs for a targeted Beast run or linked agent run
- `stop` halts an active run
- `restart` re-launches a previously started run through the same backend path as the dashboard
- `resume` resumes a paused or stopped tracked agent or linked run where the backend supports it
- `delete` removes or soft-deletes the tracked Beast record through the same control plane
- `start` and `status` may exist as aliases or UX sugar, but launch acceptance is measured against the canonical actions above

### Verification for Beast mode

Minimum proof:

- Beast mode command launches through the intended backend path
- provider selection is persisted correctly
- `claude-cli` acknowledgment gate behaves correctly
- shared-state handoff from MCP mode to Beast mode is observable
- CLI parity commands work against the same beast control plane used by the dashboard

Minimum verification matrix:

- verify one API-backed provider path that does not trigger the CLI-risk gate
- verify one `claude-cli` path that does trigger the gate on first run and does not re-prompt after acknowledgment
- verify `create`, `list`, `logs`, `stop`, `restart`, `resume`, and `delete` against the same backend state the dashboard reads
- verify Beast lifecycle operations do not mutate Claude Code MCP installation state

## Documentation And Positioning

The launch docs must stop underselling or overclaiming the product.

Required doc outcomes:

- root/project docs no longer say the product is not functioning end-to-end if the release claims launch readiness
- `@fbeast/mcp-suite` has a concrete install and usage story
- docs explain the distinction between plugin mode and standalone mode
- docs explain that dashboard is the main Beast UI while CLI has parity for core operations
- docs explain that both modes share `.fbeast/beast.db`

“Dashboard remains the main Beast UI” is a positioning and default-flow requirement, not an exclusivity requirement. Launch acceptance only requires that:

- docs and examples present the dashboard as the recommended primary operator surface
- CLI parity exists for the canonical core operations
- no Beast operation is artificially forced through the dashboard when CLI parity is part of the launch contract

## Success Criteria

The launch is ready when all of the following are true:

1. `MCP mode` uses real adapters over existing franken engines rather than stand-in implementations.
2. `fbeast-init --hooks` installs a working hook runtime.
3. `fbeast beast` exists and enforces provider-risk acknowledgment for `claude-cli`.
4. Dashboard remains the main Beast operator UI.
5. CLI has parity for the canonical core Beast operations: create, list, logs, stop, restart, resume, and delete. `start` and `status` may exist as aliases, but launch acceptance is measured against the canonical set.
6. Both modes can be used in the same project without config drift or state loss.
7. The published docs and package surfaces match what actually ships.

## Non-Goals

- redesigning the beast daemon architecture
- replacing the dashboard as the primary Beast UI
- moving Beast control into MCP
- rewriting core planner, critique, governor, observer, brain, or orchestrator engines
- expanding launch scope beyond the dual-mode release described above
