# Beasts Dispatch Station Design

**Date:** 2026-03-10
**Status:** Approved
**Scope:** `franken-orchestrator`, `franken-web`, CLI dispatch, dashboard dispatch/monitoring, secure Beast API, single-host process execution, Grafana-facing telemetry

## Problem

Frankenbeast already has useful execution primitives:

- CLI interview, planning, chunking, and execution flows in `franken-orchestrator`
- chat and dashboard-adjacent HTTP surfaces
- network operator controls
- logging and trace plumbing

What it does not have is a first-class dispatch station for agent work.

Current gaps:

- there is no shared run model for agent dispatch from CLI, dashboard, and chat
- interview, chunking, martin loop, and design generation exist as separate workflows rather than durable operator-managed runs
- the dashboard cannot fully manage agents after launch
- there is no API boundary dedicated to secure Beast dispatch
- there is no durable attempt history for restart/stop/kill semantics
- there is no Grafana-friendly telemetry surface for Beast operations
- execution is tightly coupled to in-process flows, making future isolation/containerization harder

## Goal

Add a first-class Beasts dispatch system where:

1. the dashboard is the operator dispatch station
2. the CLI can spawn beasts into `martin-loop`, `chunk-plan`, and `design-interview`
3. chat remains a separate conversational surface, but can create Beast runs via natural language
4. every Beast launch becomes a durable persisted run with immutable config snapshot
5. every run is fully trackable in the dashboard with start, restart, stop/kill, status, logs, config, and progress
6. kill stops the underlying execution but preserves the row and marks status `stopped`
7. security and rate limiting are first-class because this API can spawn local agent processes
8. telemetry is exported in a Grafana-friendly way
9. v1 executes on a single host with processes, while preserving a clean path to container-backed execution in v1.1+

## Non-Goals

- multi-host worker scheduling in v1
- user-editable Beast templates in v1
- replacing the existing chat product surface with the Beast dashboard
- forcing container execution in v1
- horizontal scale before the operator model is proven

## Product Model

### Primary surfaces

- **Dashboard**: primary dispatch and monitoring UI
- **CLI**: operator entry point for explicit Beast launch and management
- **Chat**: separate conversational surface that can create or configure Beast runs through natural-language intent resolution

### Key principle

Chat sessions are not Beast runs.

Chat may create Beast runs.

Once created, Beast runs use the same run store, event stream, attempt model, controls, and monitoring surfaces regardless of whether they were dispatched from CLI, dashboard, or chat.

## Beast Catalog

V1 uses a fixed catalog, owned by code, but shaped so it can evolve toward templated definitions later.

Initial definitions:

- `design-interview`
- `chunk-plan`
- `martin-loop`
- likely soon after: `design-to-execution`

Each definition provides:

- `id`
- `version`
- human label and description
- config schema
- optional interview schema / interview handler
- capability requirements
- executor adapter
- default rate-limit bucket
- telemetry labels

This keeps the catalog reusable and extensible internally without exposing user-authored workflow definitions yet.

## Domain Model

### `BeastDefinition`

Code-owned catalog entry describing one allowed run type.

### `BeastRun`

Durable record representing one operator-visible Beast row.

Required fields:

- `id`
- `definitionId`
- `definitionVersion`
- `status`
- `executionMode`
- `configSnapshot`
- `dispatchedBy` (`cli | dashboard | chat | api`)
- `dispatchedByUser`
- `createdAt`
- `startedAt`
- `finishedAt`
- `currentAttemptId`
- `attemptCount`
- `lastHeartbeatAt`
- `stopReason`
- `latestExitCode`

### `BeastRunAttempt`

Child execution attempt for a run. Every start/restart creates a new attempt.

Required fields:

- `id`
- `runId`
- `attemptNumber`
- `status`
- `pid`
- `startedAt`
- `finishedAt`
- `exitCode`
- `stopReason`
- `executorMetadata`

### `BeastRunEvent`

Append-only event stream for progress, logs, prompts, approvals, lifecycle transitions, and failures.

Examples:

- `run.created`
- `interview.started`
- `interview.question`
- `attempt.started`
- `attempt.stdout`
- `attempt.stderr`
- `attempt.heartbeat`
- `attempt.stopped`
- `attempt.completed`
- `attempt.failed`
- `run.status_changed`
- `approval.requested`
- `approval.resolved`

### `BeastDispatchRequest`

Validated launch request created by CLI, dashboard, or chat intent resolution.

## Run Lifecycle

Run status should support at least:

- `queued`
- `interviewing`
- `running`
- `pending_approval`
- `completed`
- `failed`
- `stopped`

Operator actions:

- `start`
- `restart`
- `stop`
- `kill`
- `view logs`
- `view config snapshot`
- `view progress`

Semantics:

- `stop` / `kill` terminates the active process and records a terminal event
- the row remains visible and the run becomes `stopped`
- `restart` creates a new `BeastRunAttempt`
- run-level status reflects the latest attempt
- historical attempts and logs remain visible forever unless explicitly cleaned up by a future retention policy

## Architecture

The Beasts system should live inside `franken-orchestrator` as a dedicated dispatch domain, not as a separate service yet.

Recommended module layout:

```text
packages/franken-orchestrator/src/beasts/
  types.ts
  definitions/
    catalog.ts
    design-interview-definition.ts
    chunk-plan-definition.ts
    martin-loop-definition.ts
  repository/
    sqlite-beast-repository.ts
    sqlite-schema.ts
  events/
    beast-event-store.ts
    beast-log-store.ts
  execution/
    beast-executor.ts
    process-beast-executor.ts
    container-beast-executor.ts
    process-supervisor.ts
  services/
    beast-catalog-service.ts
    beast-dispatch-service.ts
    beast-run-service.ts
    beast-interview-service.ts
  telemetry/
    beast-metrics.ts
    prometheus-beast-metrics.ts
  http/
    beast-routes.ts
    beast-auth.ts
    beast-rate-limit.ts
```

## Storage Model

V1 should use a local SQLite database per project, plus append-only log files.

Recommended paths under `.frankenbeast`:

- `.frankenbeast/.build/beasts.db`
- `.frankenbeast/.build/beasts/logs/<runId>/<attemptId>.log`

Why SQLite:

- durable run and attempt history
- efficient list/detail queries for dashboard tables
- simple single-host concurrency
- existing repo already ships `better-sqlite3`
- easier future migration than ad hoc JSON files

Suggested tables:

- `beast_runs`
- `beast_run_attempts`
- `beast_run_events`
- `beast_interview_sessions`

## Execution Model

### V1

- single host
- process-based execution only
- tracked child process per attempt
- stdout/stderr streamed into events and log store
- explicit timeout and budget enforcement
- constrained working directory and environment allowlist

### Future-ready interface

Every run should record:

- `executionMode: process | container`
- `resourceLimits`
- `workspaceStrategy`
- `credentialPolicy`

V1 implements:

- `ProcessBeastExecutor`

V1.1 target:

- `ContainerBeastExecutor` stub becomes a real container backend

This preserves the API and run model when execution isolation increases later.

## API Design

Add a dedicated Beast API under the existing chat server application.

### Catalog and launch

- `GET /v1/beasts/catalog`
- `POST /v1/beasts/runs`

### Run queries

- `GET /v1/beasts/runs`
- `GET /v1/beasts/runs/:runId`
- `GET /v1/beasts/runs/:runId/events`
- `GET /v1/beasts/runs/:runId/logs`

### Run controls

- `POST /v1/beasts/runs/:runId/start`
- `POST /v1/beasts/runs/:runId/stop`
- `POST /v1/beasts/runs/:runId/kill`
- `POST /v1/beasts/runs/:runId/restart`

### Interview flows

- `POST /v1/beasts/interviews/:definitionId/start`
- `POST /v1/beasts/interviews/:sessionId/answer`

### Telemetry

- `GET /metrics`

### API contract rules

- use strict Zod validation for all request bodies and params
- require idempotency keys for `POST /v1/beasts/runs`, `start`, `stop`, `kill`, and `restart`
- return structured errors only
- never expose secrets in responses

## Security

This API can spawn local agent processes, so security should be explicit and layered.

### Authn/Authz

V1 should use operator authentication for the Beast API:

- CLI authenticates with a configured operator API token
- dashboard exchanges an operator bootstrap credential for a short-lived signed session token
- every Beast route except health and metrics requires auth

Authorization should be action-based:

- `beasts.read`
- `beasts.dispatch`
- `beasts.control`
- `beasts.interview`

### Rate limiting

Aggressive per-identity rate limits on:

- run creation
- interview answer submission
- start / stop / kill / restart

Suggested buckets:

- low burst for control operations
- separate bucket for interview answers
- global circuit breaker for excessive spawn failures

### Execution safety

- Beast definitions declare allowed capabilities
- dispatch service rejects undeclared capabilities
- config snapshots store secret references where possible
- process env is explicit allowlist, never ambient pass-through
- every operator action is audit logged with actor, route, target run, and payload hash

## CLI Design

Add a dedicated operator command family:

```bash
frankenbeast beasts catalog
frankenbeast beasts spawn martin-loop
frankenbeast beasts spawn chunk-plan
frankenbeast beasts spawn design-interview
frankenbeast beasts list
frankenbeast beasts status <run-id>
frankenbeast beasts logs <run-id>
frankenbeast beasts stop <run-id>
frankenbeast beasts kill <run-id>
frankenbeast beasts restart <run-id>
```

Spawn behavior:

- CLI loads the selected Beast definition
- if the definition requires configuration interview, the CLI asks the user for answers
- the CLI submits the fully validated request through the same Beast dispatch service/API contract used by dashboard and chat

## Dashboard Design

The dashboard becomes the dispatch station for Beast agents.

### Core views

- catalog/launch panel
- active + historical runs table
- run detail drawer/page
- live logs panel
- live event timeline
- config snapshot viewer
- operator controls for start/restart/stop/kill

### Table behavior

- rows persist after completion/failure/stop
- `stopped` rows remain visible and restartable
- row shows definition, source, actor, status, current attempt, last update, and quick actions

### Launch flow

1. choose Beast type
2. answer config/interview prompts
3. confirm resolved config
4. create run
5. optionally auto-start the first attempt

### Monitoring flow

- use SSE for live updates in v1
- fetch logs and events incrementally
- show latest attempt and prior attempts

## Chat Integration

Chat remains outside the dispatch station UX, but can invoke the same Beast services.

Natural-language flow:

1. chat detects an intent like “spawn a martin beast for this repo”
2. chat resolves the target Beast definition
3. if config is incomplete, chat asks interview questions
4. chat calls `BeastDispatchService`
5. chat returns the created run id and monitoring link / status

Important boundary:

- chat transcript remains chat state
- Beast progress remains Beast run state
- any approvals or prompts emitted by Beast execution should also become run events so the dashboard sees the full lifecycle even when chat initiated the run

## Telemetry

Grafana support should be implemented through Prometheus-style metrics and structured logs/traces.

### Metrics

Expose counters/gauges/histograms for:

- runs created by definition and source
- runs currently active
- run status transitions
- attempt start/stop/restart counts
- stop and kill counts
- spawn failures
- interview starts/completions/dropoff
- approval wait duration
- run duration
- API rate-limit rejections

### Logs and traces

- structured application logs for Beast routes and executor lifecycle
- trace spans for dispatch, interview, attempt spawn, attempt stop, restart, and failure handling
- dashboard uses Beast APIs directly, not Grafana

## Testing

Add or update tests for:

- catalog listing and schema validation
- run creation with immutable config snapshot
- attempt creation on start/restart
- stop/kill preserving the run row and setting `stopped`
- live event and log retrieval
- rate-limit rejection
- auth rejection
- chat-created Beast runs
- CLI interview-driven spawn
- dashboard control actions
- metrics exposure

## Open Follow-Ups

- real operator identity provider beyond bootstrap token/session token
- container executor implementation
- retention policies for long-lived logs/events
- remote worker nodes and scheduling
- code-owned catalog to user-defined templates migration path
