# ADR-018: Tracked Agent Init Workflow

- **Date:** 2026-03-11
- **Status:** Accepted
- **Deciders:** djm204, Codex

## Context

The Beast control surface originally created Beast runs directly from the dashboard and from chat-backed Beast launch flows.

That model was too execution-centric for the new operator workflow:

- chat-backed init actions such as `/interview` and `/plan --design-doc <path>` need durable state before a Beast run exists
- startup logs and lifecycle transitions need to be visible from the moment init begins
- the dashboard needs a single detail view that survives the transition from init to execution
- Beast runs should remain execution records instead of absorbing init-only concepts such as `chatSessionId` and `initAction`

Without a separate lifecycle object, the system either conflates init state with execution state or loses visibility before dispatch.

## Decision

Introduce a tracked-agent layer above Beast runs.

Tracked agents are durable records that:

- exist before dispatch
- capture init metadata such as `initAction`, `initConfig`, `chatSessionId`, and source
- own init lifecycle statuses such as `initializing`, `dispatching`, and `running`
- collect startup events from chat-backed init flows and operator-driven launches
- link to Beast runs through `dispatchRunId`

Beast runs remain the execution record and may optionally reference a `trackedAgentId`.

The control flow becomes:

1. create tracked agent
2. run init action and record init events
3. dispatch Beast run when init completes or is approved
4. keep tracked-agent lifecycle synchronized with the linked Beast run

The dashboard Beasts tab becomes tracked-agent centric:

- catalog launches call `POST /v1/beasts/agents`
- detail panes render tracked-agent metadata and startup events first
- linked run logs and controls appear after dispatch

## Consequences

### Positive
- init and execution concerns are separated cleanly
- chat-backed init flows gain durable linkage and startup observability
- dashboard and backend share a single lifecycle object from launch through execution
- Beast runs stay focused on execution semantics

### Negative
- the control plane now has two linked records instead of one
- route, service, and UI code must hydrate both tracked-agent and Beast-run state
- CLI parity needs explicit follow-up work so CLI-created agents use the same model everywhere

### Risks
- lifecycle drift is possible if tracked-agent status is not updated when linked Beast runs change
- duplicated logs or status transitions can appear if both init and run layers emit overlapping events
- consumers may misuse Beast runs directly and bypass the tracked-agent layer unless the agent-first contract stays explicit

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Extend `BeastRun` to represent init lifecycle too | Smaller schema surface, fewer top-level records | Conflates init and execution semantics, awkward chat linkage, poor fit for pre-dispatch logs | Needed a durable object before run creation without overloading execution records |
| Keep backend run-centric and fake tracked agents in the UI | Lowest backend cost | UI state would drift from server truth, chat-backed init still untracked | Did not satisfy the lifecycle and observability requirements |
| Add tracked agents above Beast runs | Separates lifecycle stages cleanly, supports chat-backed init, keeps Beast runs execution-focused | More persistence and API surface area | Chosen because it fits the required operator workflow with durable state |
