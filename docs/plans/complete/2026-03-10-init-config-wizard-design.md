# Init Config Wizard Design

**Date:** 2026-03-10

## Goal

Ship a CLI-first `frankenbeast init` workflow that is easy to operate, writes one canonical top-level config file, persists resumable init progress, and only exposes modules and comms transports the runtime can actually support today.

## Current Reality

The repo already has a canonical project config path at `.frankenbeast/config.json`. `franken-orchestrator` already loads that file through a single config pipeline and already fans validated config into runtime-managed services.

What does not exist yet is the operator-friendly entrypoint:

- no `init` command
- no wizard
- no resumable init state
- no verify/repair flow
- no supported-transport registry for comms branching

The design must therefore build on the current config and runtime model, not invent a second parallel configuration system.

## Decision

Build a shared init engine inside `franken-orchestrator`, expose it through the CLI first, and keep the persisted runtime config canonical at `.frankenbeast/config.json`.

Persist init progress separately at `.frankenbeast/init-state.json`.

## Configuration Model

### Canonical runtime config

The runtime source of truth stays in:

- `.frankenbeast/config.json`

This file should contain only real, runtime-consumable config:

- provider/runtime defaults
- `network`
- `chat`
- `dashboard`
- `comms`
- only the comms transports that orchestrator runtime currently supports

There should not be per-module persisted config files.

### Init progress state

The init workflow also writes:

- `.frankenbeast/init-state.json`

This file tracks:

- selected modules
- selected comms transports
- completed wizard steps
- secure/insecure selection
- last verification outcome
- resumability metadata

This separation keeps runtime config clean while allowing interrupted init to resume safely.

## Supported V1 Surfaces

The wizard should expose only what the repo can support today.

### Modules

- `chat`
- `dashboard`
- `comms`
- provider/runtime defaults

### Comms branching

If `comms` is disabled:

- skip comms setup entirely

If `comms` is enabled:

1. detect runtime-supported comms transports
2. show a toggleable list
3. branch into transport-specific setup only for enabled transports

For the current repo state, runtime-supported transports are:

- `slack`
- `discord`

`telegram` and `whatsapp` exist in `franken-comms`, but are not yet wired through orchestrator runtime config/startup and should be documented as future extension points rather than exposed as working init choices.

## CLI UX

Primary commands:

- `frankenbeast init`
- `frankenbeast init --verify`
- `frankenbeast init --repair`
- `frankenbeast init --non-interactive`

### `frankenbeast init`

Flow:

1. detect existing config and init-state files
2. show whether this is a new run, resume, or edit
3. ask which modules to enable
4. ask only relevant follow-up questions
5. if `comms` is enabled, ask which supported transports to enable
6. branch into each selected transport’s setup wizard
7. write canonical config
8. write init-state
9. run verification
10. print clear next steps if anything is incomplete

### `--verify`

Checks:

- config exists and validates
- init-state exists and is consistent
- only enabled modules are verified
- only enabled comms transports are verified

Output must be operator-friendly and actionable.

### `--repair`

Repair reuses the same engine but only revisits incomplete or failing sections. It must preserve already valid answers.

## Runtime Boundary

The runtime should continue to consume one validated top-level config object.

That means:

- `loadConfig()` stays the canonical loader
- runtime services derive only the slices they need from the validated config
- init logic should not become a second configuration authority

If additional runtime alignment is needed, it should happen by improving projection functions and schemas, not by scattering config files across modules.

## Future Extension Points

These are intentionally documented but not implemented in v1:

- dashboard/API init surface over the same engine
- dashboard-managed agent profiles
- file-store integrations
- productivity integrations
- additional orchestrator-supported comms transports

Those should plug into the same model:

- canonical top-level config
- separate init-state
- module/transport registries
- verify/repair flow

## Testing

V1 must ship with tests for:

- CLI parsing and dispatch
- init-state persistence
- module and transport support registries
- canonical config generation
- resume behavior
- verify/repair behavior
- runtime consumption of the generated config

## Summary

This design keeps v1 narrow and useful:

- one config file
- one init engine
- one resumable init state
- one CLI-first operator experience

It does not fake support for modules that are still plan-stage, and it keeps the runtime ready for a future dashboard-driven init surface without rewriting the underlying model.
