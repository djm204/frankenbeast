# Agent Init Workflow Design

**Date:** 2026-03-11

## Goal

Unify dashboard and CLI agent creation behind a single lifecycle:

`InitAction -> AgentCreated(initializing) -> InitFinished/Approved -> DispatchTriggered`

This applies to all launch paths, including:

- `design-interview`
- `design-doc -> chunk creation`
- `martin-loop`

## Problem

The current dashboard `Beasts` catalog launches direct Beast runs. That is too narrow for the desired workflow:

- some launch flows should be chat-backed init actions (`/interview`, `/plan --design-doc <path>`)
- startup progress and logs need to be visible immediately in tracked agents
- dispatch should happen only after init completes or is approved
- “tracked agents” should represent the whole lifecycle, not only post-dispatch execution

## Desired Operator Experience

### Dashboard

1. Operator opens the `Beasts` catalog.
2. Operator fills required inputs.
3. Relevant entries use file/directory pickers:
   - `design-interview`: no picker
   - `design-doc -> chunk creation`: file picker
   - `martin-loop`: directory picker for chunk files
4. Clicking launch creates a tracked agent in `initializing`.
5. The dashboard routes into tracked agent detail and shows live startup logs/status.
6. For chat-backed init flows:
   - `design-interview` reuses the current chat session and sends `/interview`
   - `design-doc -> chunk creation` reuses the current chat session and sends `/plan --design-doc <path>`
7. When init completes or is approved, the system triggers dispatch.
8. The tracked agent detail remains the source of truth for status, events, and logs.

### CLI

CLI-created agents should enter the same lifecycle and persistence model, so dashboard and CLI observe the same tracked object.

## Architecture Decision

Introduce an agent-centric layer above the current Beast run execution model.

### Why a New Agent Layer

The current Beast model is execution-centric:

- `BeastRun` starts at creation of a run
- statuses are tuned for execution and interview state, not for multi-stage init workflows
- chat-backed initialization is not first-class in the Beast run lifecycle

The desired workflow needs a durable object that exists before dispatch begins and can represent:

- init action type
- linked chat session
- startup progress and logs
- approval state
- eventual dispatch/run linkage

### Proposed Model

Add a tracked agent record with fields such as:

- `id`
- `kind` / `definitionId`
- `source` (`dashboard`, `cli`, `chat`, `api`)
- `status`:
  - `initializing`
  - `awaiting_approval`
  - `dispatching`
  - `running`
  - `completed`
  - `failed`
  - `stopped`
- `chatSessionId?`
- `initAction`
- `initConfig`
- `dispatchRunId?`
- timestamps

Logs/events should attach to the agent from the start, not only after run creation.

## Catalog Changes

### `design-interview`

- stays in the catalog
- launch creates tracked agent
- reuses current chat session if one exists; otherwise creates one
- sends `/interview`
- emits logs/status in the tracked-agent view

### `design-doc -> chunk creation`

- add as a new catalog entry
- requires a design-doc file picker
- launch creates tracked agent
- reuses current chat session if one exists; otherwise creates one
- sends `/plan --design-doc <path>`
- emits logs/status in the tracked-agent view

### `martin-loop`

- update config to take a chunk directory path instead of the current provider/objective-only flow
- launch creates tracked agent in `initializing`
- startup/init logs appear in tracked agents
- on init completion or approval, dispatch transitions into MartinLoop execution

## Dashboard UI Changes

### Beast Catalog

Extend the catalog cards to support typed inputs:

- text
- select
- file picker
- directory picker

Path validation rules:

- design-doc entry must resolve to a file
- MartinLoop entry must resolve to a directory

### Tracked Agents View

The current “runs” panel should evolve into tracked agents, where:

- rows show init status as well as dispatch status
- detail view shows:
  - init metadata
  - linked chat session
  - dispatch run id
  - startup logs
  - run logs/events after dispatch

## Backend Flow

### Agent Creation

Add a backend API for creating tracked agents from the dashboard/catalog, distinct from immediate `createRun()` execution.

For chat-backed init actions:

1. create tracked agent in `initializing`
2. bind or create chat session
3. inject the appropriate command into that session
4. persist startup events/log lines against the agent
5. when init finishes, mark the agent `awaiting_approval` or `dispatching`

For MartinLoop:

1. create tracked agent in `initializing`
2. validate chunk directory and config
3. write startup events/log lines
4. trigger dispatch into execution once init is complete or approved

### Dispatch Linkage

Dispatch should create or attach a Beast run and backfill `dispatchRunId` on the tracked agent.

The agent detail API should hydrate both:

- agent lifecycle data
- linked Beast run data and logs

## Chat Integration

The existing chat runtime is already the right place to execute `/interview` and `/plan`.

What is missing is durable linkage:

- an agent id must be associated with the chat session/turn that started the init action
- chat execution progress must be mirrored into agent events/logs
- completion/approval must publish an agent lifecycle transition

## File Picking

### Design Principles

- browser-first, minimal surface area
- path remains visible and editable after selection
- picker errors are inline and block launch

### Required Support

- file picker for design docs
- directory picker for chunk directories

If browser-native directory support is insufficient for the deployment target, add a backend-assisted picker only as a follow-up. The first implementation should stay as close to browser-native controls as possible.

## Testing Strategy

Add coverage for:

- catalog rendering of new entries and picker controls
- design-interview launch reusing current chat session
- design-doc launch sending `/plan --design-doc <path>`
- MartinLoop launch requiring a directory path
- tracked agent lifecycle transitions
- dashboard agent detail showing startup logs and final dispatch linkage
- CLI launches entering the same tracked-agent model

## Non-Goals

- full redesign of the dashboard shell
- replacing the current Beast run storage in one step without compatibility
- building a general-purpose local file browser if browser-native pickers suffice

## Recommended Rollout

1. Introduce tracked-agent types + persistence without removing existing Beast runs.
2. Add dashboard APIs and UI for tracked agents.
3. Rewire catalog launch flows to create tracked agents first.
4. Add chat-backed init actions (`/interview`, `/plan --design-doc ...`).
5. Rewire MartinLoop to the same lifecycle.
6. Keep Beast runs as dispatch/execution records linked from the tracked agent.
