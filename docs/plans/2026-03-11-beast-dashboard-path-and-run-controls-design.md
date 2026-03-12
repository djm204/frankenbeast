# Beast Dashboard Path And Run Controls Design

**Date:** 2026-03-11

## Goal

Fix the dashboard dispatch flow so `chunk-plan` uses valid server/repo paths instead of browser fake file paths, and add tracked-agent lifecycle controls for immediate kill plus graceful pause/resume semantics.

## Problem

The current `BeastDispatchPage` treats browser `file` prompts as local file pickers and writes `event.target.value` into `designDocPath`. In browsers that value is intentionally exposed as `C:\fakepath\...`, which is unusable because the backend expects a server-readable path string and later reads the file from disk.

At the same time, the tracked-agent screen exposes run controls but not the lifecycle language the operator wants:

- `Kill` should remain an immediate process kill.
- `Pause` should mean graceful stop.
- `Resume` should create a new run attempt under the same tracked agent after a graceful stop.

## Constraints

- Keep the current backend contract for `chunk-plan`: `designDocPath` and `outputDir` are path strings, not uploaded file blobs.
- Preserve tracked-agent history and Beast run attempt history.
- Do not add a browser upload pipeline as part of this change.
- Keep kill semantics immediate for process-mode beasts.

## Chosen Approach

Use plain text path inputs for server-path prompts and move the run controls toward agent lifecycle language.

### Why This Approach

- It matches the current orchestrator contract without inventing a new upload surface.
- It removes the misleading browser file-picker behavior that can never produce a usable backend path.
- It fits the existing run/attempt model: graceful stop ends the active attempt, resume creates the next attempt.

## Dashboard UX

### `chunk-plan` Inputs

- `designDocPath` stays editable text.
- `outputDir` stays editable text.
- The browser file-picker affordance is removed for server-path prompts.
- Validation should reject obvious browser fake paths such as `C:\fakepath\...` with an operator-facing message telling the user to enter a repo/server path manually.

### Agent Controls

The tracked-agent rows and detail panel should use lifecycle language:

- `Pause` calls graceful stop on the linked run.
- `Resume` creates a new attempt for the same tracked agent when the linked run is stopped.
- `Kill` immediately terminates the active linked run.

Buttons should render only when the action is valid for the current agent/run state.

## Backend Flow

### Pause

- Pause maps to the existing graceful stop behavior.
- For process-mode beasts this remains `SIGTERM`.
- The linked run becomes `stopped`, and the tracked agent remains linked to that run.

### Resume

- Resume is agent-centric, not attempt-centric.
- Resuming a stopped tracked agent creates a new attempt under the same agent by creating or restarting execution through the existing run/attempt machinery.
- Attempt history remains attached to the same tracked agent so the operator can inspect prior stopped attempts and resumed attempts together.

### Kill

- Kill remains run-centric and immediate.
- For process-mode beasts this remains `SIGKILL`.

## API Shape

Add a tracked-agent resume action rather than forcing the dashboard to reconstruct dispatch details itself.

Recommended endpoint:

- `POST /v1/beasts/agents/:agentId/resume`

Responsibilities:

- load the tracked agent
- validate that resume is legal for its current state
- create a new run attempt or new linked run execution using the stored init config
- keep the agent linkage intact
- append lifecycle events so the dashboard can show what happened

Pause and kill can continue to target the linked run endpoints already present today.

## Data And Status Model

- Keep `stopped` as the persisted run status for graceful pause.
- Keep tracked-agent status synchronized from the linked run, but treat `stopped` as resumable from the dashboard.
- Resume should increase attempt history rather than overwrite prior attempt records.

## Testing Strategy

### Web

- regression test for fake browser path rejection
- component tests for plain text `chunk-plan` path fields
- component tests for `Pause`, `Resume`, and `Kill` button visibility and dispatch
- API client tests for the new resume endpoint

### Orchestrator

- route tests for `POST /v1/beasts/agents/:agentId/resume`
- service tests proving resume on a stopped tracked agent creates a new attempt under the same agent
- process-execution tests proving stop remains graceful and kill remains immediate

## Non-Goals

- local file upload from the dashboard
- directory browsing or backend-assisted file picking
- changing chat-driven init flows
- redesigning the full tracked-agent data model beyond what is needed for resume
