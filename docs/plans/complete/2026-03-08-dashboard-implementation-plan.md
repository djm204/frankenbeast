# Frankenbeast Dashboard — Implementation Plan

**Date:** 2026-03-08
**Status:** Proposed
**Scope:** Cross-module

## Goal

Build a comprehensive Frankenbeast dashboard that combines:

- operational observability
- token, cost, and model metrics
- chat and execution analytics
- usage reporting by session, repo, provider, and feature
- approval, safety, and failure visibility

The dashboard should serve two audiences:

1. **Operator view** — "What is Frankenbeast doing right now, and is it healthy?"
2. **Product view** — "How are people using it, what costs money, and what actually succeeds?"

This should reuse existing `franken-observer` and `franken-orchestrator` primitives rather than create a second telemetry stack.

---

## Existing Building Blocks

The repo already has the right substrate:

- `franken-observer` traces, spans, token counting, cost calculation
- `ModelAttribution` for cost and success by model
- `PrometheusAdapter` for metrics scraping
- `TraceServer` for lightweight local inspection
- `generateGrafanaDashboard()` for imported Grafana dashboards
- `franken-orchestrator` observer bridge and session-level spend aggregation
- governor approvals and observer-recorded spans
- chat plan now being added in `franken-orchestrator`

The dashboard should extend these, not bypass them.

---

## Dashboard Scope

## 1. Operations Dashboard

Show the live state of running sessions and system health:

- active sessions
- current phase by session
- current model/provider in use
- live token and spend burn
- open approvals
- recent failures
- circuit-breaker events
- loop detections
- queue depth or pending work

## 2. Analytics Dashboard

Show trend and product usage data:

- sessions per day
- chat turns per day
- cheap vs premium turn mix
- execution turns vs answer-only turns
- approval rate
- success/failure/abort rate
- model/provider usage share
- cost per session, cost per successful execution, cost per repo
- common request types
- escalation rates from cheap to premium

## 3. Usage Reporting

Support filtered reporting by:

- date range
- project/repo
- session
- provider/model
- user or operator identity if available later
- surface: CLI vs web
- turn type: reply, clarify, plan, execute

---

## Product Questions the Dashboard Must Answer

- How many sessions are running right now?
- What is total spend today, this week, and by project?
- Which models are costing the most?
- Which models actually succeed for coding tasks?
- What percentage of turns stay cheap?
- What prompts escalate into premium execution most often?
- How often do approvals block work?
- What are the top failure categories?
- Which repos or teams use Frankenbeast most?
- Is the web chat used differently from the CLI?

If the dashboard cannot answer those questions, it is incomplete.

---

## Architecture

Use a layered model:

### Layer 1: Event emission

Events emitted by orchestrator, chat engine, governor, and observer:

- session started
- session ended
- turn received
- turn routed
- model invoked
- execution started
- execution completed
- approval requested
- approval decided
- circuit breaker tripped
- injection blocked
- loop detected
- trace finalized

### Layer 2: Canonical analytics records

Normalize events into a small set of analytics entities:

- `SessionRecord`
- `TurnRecord`
- `ExecutionRecord`
- `ApprovalRecord`
- `CostRecord`
- `FailureRecord`

### Layer 3: Storage

Two stores, two purposes:

- **time-series / metrics store**
  - Prometheus for counters and live dashboards
- **queryable analytics store**
  - SQLite in v1
  - schema optimized for filtering and aggregates

### Layer 4: Dashboard API

A backend service that exposes:

- health and live metrics summaries
- session lists and drill-downs
- analytics aggregates
- charts and table data
- trace/detail links

### Layer 5: Dashboard UI

A dedicated web UI with:

- overview page
- live operations page
- usage analytics page
- cost page
- safety/approvals page
- session explorer
- trace drill-down

---

## Recommended Package Placement

### Extend `franken-observer`

Add reusable telemetry and aggregation primitives:

```text
franken-observer/src/
  analytics/
    event-types.ts
    analytics-recorder.ts
    analytics-sqlite.ts
    aggregates.ts
    usage-report-builder.ts
  dashboard/
    dashboard-api.ts
    dashboard-routes.ts
    dashboard-server.ts
```

### Extend `franken-orchestrator`

Emit dashboard-relevant events:

```text
franken-orchestrator/src/
  analytics/
    chat-events.ts
    execution-events.ts
    observer-event-bridge.ts
```

### Add a UI package

```text
franken-dashboard/
  src/
    pages/
      overview.tsx
      live.tsx
      analytics.tsx
      costs.tsx
      safety.tsx
      sessions.tsx
    components/
      metric-card.tsx
      timeseries-chart.tsx
      sankey-routing.tsx
      session-table.tsx
      approvals-table.tsx
      failure-table.tsx
```

Keep the dashboard UI separate from the end-user chat UI. They have different audiences and density requirements.

---

## Core Event Taxonomy

Every emitted event should include:

- `eventId`
- `timestamp`
- `sessionId`
- `projectId`
- `surface` = `cli | web | api`
- `sourceModule`

Specific event payloads:

### Session events

- `session.started`
- `session.ended`
- `session.resumed`

Fields:

- repo root
- branch
- duration
- final status

### Turn events

- `turn.received`
- `turn.routed`
- `turn.completed`

Fields:

- turn id
- turn action
- intent class
- chosen mode
- escalation reason

### Model events

- `model.requested`
- `model.completed`
- `model.failed`

Fields:

- provider
- model
- prompt tokens
- completion tokens
- cost
- latency

### Execution events

- `execution.started`
- `execution.task.completed`
- `execution.completed`
- `execution.failed`

Fields:

- task counts
- files changed
- tests run
- verification command

### Approval events

- `approval.requested`
- `approval.approved`
- `approval.rejected`
- `approval.expired`

Fields:

- reason
- trigger type
- time to decision

### Safety events

- `safety.injection_blocked`
- `safety.budget_tripped`
- `safety.loop_detected`
- `safety.validation_failed`

Fields:

- rule or trigger
- severity
- affected phase

---

## Metrics Spec

## Core counters

- `franken_sessions_total`
- `franken_turns_total`
- `franken_turns_by_action_total`
- `franken_turns_by_mode_total`
- `franken_executions_total`
- `franken_approvals_total`
- `franken_failures_total`
- `franken_injection_blocks_total`
- `franken_budget_trips_total`

## Cost and token metrics

- `franken_tokens_total`
- `franken_cost_usd_total`
- `franken_cost_usd_by_project_total`
- `franken_cost_usd_by_surface_total`
- `franken_cost_usd_by_model_total`

## Latency metrics

- `franken_turn_latency_ms`
- `franken_model_latency_ms`
- `franken_execution_latency_ms`
- `franken_approval_wait_ms`

## Gauges

- `franken_active_sessions`
- `franken_pending_approvals`
- `franken_running_executions`

These should either extend `PrometheusAdapter` or sit beside it as a dashboard-focused adapter layer.

---

## Analytics Schema

For v1, use SQLite tables like:

### `sessions`

- `session_id`
- `project_id`
- `surface`
- `repo_root`
- `started_at`
- `ended_at`
- `status`
- `total_cost_usd`
- `total_turns`

### `turns`

- `turn_id`
- `session_id`
- `created_at`
- `intent_class`
- `turn_action`
- `mode`
- `escalated`
- `escalation_reason`
- `latency_ms`

### `model_calls`

- `call_id`
- `turn_id`
- `provider`
- `model`
- `prompt_tokens`
- `completion_tokens`
- `cost_usd`
- `latency_ms`
- `status`

### `executions`

- `execution_id`
- `turn_id`
- `started_at`
- `ended_at`
- `status`
- `tasks_total`
- `tasks_failed`
- `files_changed`
- `tests_run`

### `approvals`

- `approval_id`
- `turn_id`
- `requested_at`
- `decided_at`
- `decision`
- `trigger_type`
- `reason`

### `failures`

- `failure_id`
- `session_id`
- `turn_id`
- `category`
- `source_module`
- `message`
- `severity`
- `created_at`

---

## UI Pages

## 1. Overview

Top-level KPIs:

- active sessions
- sessions today
- total spend today
- premium turn percentage
- execution success rate
- approvals pending
- failures in last 24h

## 2. Live Operations

- currently active sessions
- current phase/mode
- live token burn
- approval queue
- recent alerts

## 3. Usage Analytics

- sessions over time
- turns by action
- turn funnel: received -> routed -> executed -> successful
- cheap-to-premium escalation flow
- CLI vs web usage split

## 4. Cost Analytics

- spend over time
- spend by model
- spend by project
- cost per successful execution
- cheap vs premium savings estimate

## 5. Safety and Governance

- approval request volume and outcomes
- injection blocks
- budget trips
- loop detections
- failure categories by module

## 6. Session Explorer

- searchable sessions table
- click through to transcript, trace, execution summary, and costs

## 7. Trace Drill-down

Reuse existing trace concepts:

- trace summary
- span waterfall
- tokens by span
- model used by span
- error metadata

This should either embed or supersede the current `TraceServer` UI.

---

## Integration Plan

## Phase 1: Telemetry Contract

Deliverables:

- analytics event taxonomy
- shared TypeScript types
- recorder interface
- v1 SQLite schema

Tests:

- event validation
- schema migrations
- aggregate query correctness

## Phase 2: Orchestrator and Chat Emission

Deliverables:

- emit session/turn/execution events from orchestrator
- emit chat routing and escalation events from chat engine
- emit approval events from governor integration

Tests:

- reply-only turns record cheap mode
- execution turns record escalation reason
- approval-required turns emit approval lifecycle

## Phase 3: Observer Metrics Bridge

Deliverables:

- dashboard-focused metrics adapter
- bridge existing trace/span/cost data into dashboard counters and aggregates
- model attribution reporting endpoint

Tests:

- counters increment correctly across traces
- cost numbers match `CostCalculator`
- attribution totals match raw model call data

## Phase 4: Dashboard API

Use Hono.

Endpoints:

- `GET /api/dashboard/overview`
- `GET /api/dashboard/live`
- `GET /api/dashboard/usage`
- `GET /api/dashboard/costs`
- `GET /api/dashboard/safety`
- `GET /api/dashboard/sessions`
- `GET /api/dashboard/sessions/:id`
- `GET /api/dashboard/traces/:id`
- `GET /api/dashboard/metrics`

Tests:

- validation and filtering
- structured error responses
- aggregate correctness
- pagination for sessions

## Phase 5: Dashboard UI

Deliverables:

- `franken-dashboard` app
- dense operator-oriented layout
- charts, tables, filters, drill-downs

Tests:

- overview renders aggregate cards
- filters update all panels
- session drill-down links to trace details
- live page refreshes correctly

## Phase 6: Grafana Pack

Deliverables:

- extend `generateGrafanaDashboard()` to include new counters
- ship an opinionated Grafana JSON for infra teams

Tests:

- generated dashboard references all required metric families
- panel IDs and datasource wiring remain valid

## Phase 7: Hardening

Deliverables:

- retention policy
- PII scrubbing in analytics storage
- auth for dashboard API
- rate limits
- export/import path for reports

Tests:

- sensitive values are not persisted
- unauthorized requests are rejected
- retention cleanup keeps aggregates correct

---

## Design Decisions

### Separate dashboard from chat UI

The dashboard is for operators, not end users. Keep it separate from the conversational app.

### SQLite first, not warehouse first

For v1, SQLite is sufficient and fits the current repo. Keep the recorder interface abstract so Postgres/ClickHouse can be added later if needed.

### Metrics plus analytics, not one or the other

Prometheus is right for live counters and alerts. SQLite is right for filtered history and product usage analysis. Use both.

### Reuse observer trace identity everywhere

Do not invent a second trace identifier system. Session, turn, execution, and trace records should cross-link cleanly.

---

## Visual Direction

This should not look like a toy trace page.

Recommended visual posture:

- high-density operator console
- bright semantic color for states and alerts
- clear hierarchy between live status, trend charts, and drill-down tables
- responsive but desktop-first

Key UI elements:

- KPI cards
- stacked area charts
- provider/model cost bars
- approval queue table
- failure heatmap by module
- routing funnel or Sankey for cheap -> premium -> execution flow

---

## First Milestone

The first milestone should be:

**"I can open a dashboard and see active sessions, total spend today, recent failures, pending approvals, and top models by cost."**

That is the minimum useful operator dashboard.

---

## Exit Criteria

This dashboard effort is complete when:

- operators can monitor live Frankenbeast activity
- product usage trends are queryable by date, repo, surface, and model
- cost and token usage are visible and trustworthy
- approvals and safety events are first-class, not buried in traces
- session-to-trace drill-down works
- Grafana and native dashboard views both exist
- tests cover metrics, aggregates, filters, and API behavior

