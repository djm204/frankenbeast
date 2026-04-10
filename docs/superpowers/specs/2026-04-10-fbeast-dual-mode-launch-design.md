# fbeast Dual-Mode Launch Design

**Date:** 2026-04-10
**Status:** Proposed
**Scope:** First live release that ships both MCP mode and Beast mode, with MCP completed first.

## Goal

Ship `@fbeast/mcp-suite` and Beast mode together without conflating their control planes.

The release must make two things true at the same time:

1. `MCP mode` is a credible Claude Code plugin surface backed by real frankenbeast engines rather than local stand-ins.
2. `Beast mode` is a credible standalone runtime backed by the existing beast control plane, with both dashboard and CLI parity for core operations.

Both modes must share the same `.fbeast/beast.db` state so users can move between them without losing memory, plans, traces, or budget history.

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

## Shared State Model

Both modes share `.fbeast/beast.db`, but they do not share process ownership.

Shared data expectations:

- memory entries written in MCP mode are visible to Beast mode
- plans written in MCP mode are visible to Beast mode where relevant
- observer traces and cost data remain queryable across both modes
- governor and firewall logs persist across mode switches

Isolation expectations:

- enabling or disabling MCP servers must not change beast daemon behavior
- starting or stopping Beast mode must not mutate Claude Code MCP config
- dashboard/CLI beast operations must not depend on MCP server installation

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

Requirements:

- warning only gates `claude-cli`
- compliant API providers do not require this acknowledgment
- acknowledgment persists and is not re-prompted every run
- refusal aborts Beast mode launch cleanly

### CLI parity

Day-one CLI parity for Beast operations is:

- `start/create`
- `list/status`
- `logs`
- `stop`
- `resume/restart`
- `delete`

The dashboard remains the primary UI, but no core beast operation should require the dashboard.

### Verification for Beast mode

Minimum proof:

- Beast mode command launches through the intended backend path
- provider selection is persisted correctly
- `claude-cli` acknowledgment gate behaves correctly
- shared-state handoff from MCP mode to Beast mode is observable
- CLI parity commands work against the same beast control plane used by the dashboard

## Documentation And Positioning

The launch docs must stop underselling or overclaiming the product.

Required doc outcomes:

- root/project docs no longer say the product is not functioning end-to-end if the release claims launch readiness
- `@fbeast/mcp-suite` has a concrete install and usage story
- docs explain the distinction between plugin mode and standalone mode
- docs explain that dashboard is the main Beast UI while CLI has parity for core operations
- docs explain that both modes share `.fbeast/beast.db`

## Success Criteria

The launch is ready when all of the following are true:

1. `MCP mode` uses real adapters over existing franken engines rather than stand-in implementations.
2. `fbeast-init --hooks` installs a working hook runtime.
3. `fbeast beast` exists and enforces provider-risk acknowledgment for `claude-cli`.
4. Dashboard remains the main Beast operator UI.
5. CLI has parity for core Beast operations: start/create, list/status, logs, stop, resume/restart, delete.
6. Both modes can be used in the same project without config drift or state loss.
7. The published docs and package surfaces match what actually ships.

## Non-Goals

- redesigning the beast daemon architecture
- replacing the dashboard as the primary Beast UI
- moving Beast control into MCP
- rewriting core planner, critique, governor, observer, brain, or orchestrator engines
- expanding launch scope beyond the dual-mode release described above
