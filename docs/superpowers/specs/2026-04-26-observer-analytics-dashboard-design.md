# Observer Analytics Dashboard Design

**Date:** 2026-04-26
**Status:** Approved for planning
**Worktree:** `fbeast/obs-dashboard`

## Goal

Turn the existing `Analytics` section in the Frankenbeast web dashboard from a placeholder into a read-only operator analytics surface that makes it easy to answer:

- what happened recently
- what failed or was rejected
- which session/tool was involved
- how much token/cost activity occurred

The first cut must default to a global "all activity" view, then allow operators to filter by session for deeper drill-down.

## Non-Goals

- No mutation or control actions from analytics
- No standalone observer dashboard outside the existing web dashboard
- No full observability platform or generic telemetry explorer
- No write/edit/delete actions for audit or governor records
- No advanced charting requirement for v1

## User Intent

The operator wants one place inside the dashboard to navigate observer, governor, and failure information without dropping into SQLite or raw logs. They specifically want easy visibility into:

- rejection counts
- error/failure counts
- injection/security detections
- "anything that doesn't work as expected"

## Product Decision Summary

- House the feature under the existing `Analytics` dashboard section
- Default to global activity across all sessions
- Make session filtering the primary drill-down path
- Keep the feature read-only
- Include lightweight navigation actions only:
  - copy raw JSON/details
  - jump into the selected session filter
  - open linked Beast run/agent when available
- Feed analytics from:
  - observer audit data
  - governor decision data
  - token/cost data
  - Beast run/agent failures from the orchestrator backend

## UX Overview

### Entry Point

The existing `Analytics` nav item becomes live in the dashboard shell instead of rendering the generic placeholder page.

### Page Structure

The analytics page has four layers:

1. Summary cards
2. Global filters
3. Split tables
4. Drill-down drawer

### Summary Cards

The top row shows operator-focused metrics for the active filter scope:

- total event volume
- unique session count
- denials/rejections
- error/failure count
- injection/security detections
- token total
- cost total

Cards reflect the current filters. In the default state, they summarize all visible activity globally.

### Global Filters

The page includes a compact operator filter bar with:

- session selector
- tool name search
- outcome/severity filter
- time window selector

The default session state is `All sessions`. Selecting a session narrows the whole page: cards, tables, and drawer navigation.

### Main Split Tables

The main page body uses two coordinated tables:

#### 1. Activity Table

Backed primarily by observer audit events. This table answers "what ran and when?".

Columns should include:

- timestamp
- session id
- tool name
- event type
- phase or category

#### 2. Decision & Failures Table

Backed by governor decisions plus Beast failures and other abnormal signals. This table answers "what went wrong or was blocked?".

Columns should include:

- timestamp
- session or linked run/agent if available
- source (`governor`, `beast`, `observer`, `security`)
- outcome (`approved`, `denied`, `failed`, `error`, `detected`)
- summary reason

### Drill-Down Drawer

Clicking any table row opens a right-side drawer with:

- normalized detail fields
- raw JSON payload
- related identifiers (session, run, agent, tool)
- quick actions:
  - copy JSON
  - jump to session filter
  - open linked run/agent detail when available

The drawer is read-only.

## Data Model

The UI should not query raw database tables directly from the browser. The orchestrator backend will expose a normalized analytics API that combines the necessary sources into dashboard-friendly shapes.

### Source Systems

#### Observer

SQLite-backed observer data from `.fbeast/beast.db`, especially:

- `audit_trail`
- `cost_ledger`

#### Governor

SQLite-backed governor decisions from:

- `governor_log`

#### Beast Runtime

Existing orchestrator run/agent state for:

- run failures
- agent failures
- linked run/agent identifiers used by drill-down navigation

#### Security / Injection Detection

Where current telemetry exists, surface detections as part of the failure/decision analytics stream. V1 should only expose signals that are already being recorded or can be derived from the current backend cleanly.

## Backend API Shape

Introduce a dedicated read-only analytics API under the orchestrator backend.

### `GET /api/analytics/summary`

Returns global or filtered summary metrics:

- `totalEvents`
- `uniqueSessions`
- `denialCount`
- `errorCount`
- `failureCount`
- `securityDetectionCount`
- `tokenTotals`
- `costTotals`

Query params:

- `sessionId` optional
- `timeWindow` optional
- `toolQuery` optional
- `outcome` optional

### `GET /api/analytics/events`

Returns normalized table rows for activity and abnormal-event views.

Supports:

- global default scope
- optional session filter
- optional tool query
- optional outcome filter
- pagination
- newest-first sort

The response should carry enough metadata for the UI to split rows into the two visible tables without repeating aggregation logic in React.

### `GET /api/analytics/sessions`

Returns session options for the filter control with lightweight counts:

- session id
- last activity time
- event count
- failure/rejection count

### `GET /api/analytics/events/:id`

Returns the full normalized record for the drawer:

- normalized fields
- raw payload JSON
- related session/run/agent/tool references

## Normalization Rules

The backend should normalize multiple sources into a common event shape so the frontend can render one consistent drawer and shared filters.

Suggested normalized fields:

- `id`
- `timestamp`
- `sessionId`
- `toolName`
- `source`
- `category`
- `outcome`
- `summary`
- `severity`
- `raw`
- `links`

### Outcome Semantics

The analytics page must highlight anything that "didn't work as expected". V1 should explicitly classify at least:

- `approved`
- `denied`
- `review_recommended`
- `failed`
- `error`
- `detected`

Where exact source semantics differ, normalization should preserve the raw payload while mapping to the closest shared outcome.

## Frontend Architecture

### Dashboard Shell

Update the current dashboard shell so `analytics` is marked live and routes to a real page instead of the placeholder.

### Analytics Page

Create a dedicated analytics page and supporting components within `packages/franken-web`:

- summary card strip
- filter bar
- activity table
- decisions/failures table
- drill-down drawer

### Client Layer

Add a dedicated analytics client in the web app rather than overloading the existing dashboard snapshot client. The analytics client should own:

- summary fetch
- session filter options fetch
- paged event fetch
- detail fetch

### State

Use dashboard-local state for:

- active filters
- selected row
- loaded summary
- loaded events
- session options
- drawer detail

The page does not need global cross-app state in v1 unless existing dashboard patterns require it.

## Error Handling

### Backend

- Return well-shaped errors for invalid filters
- Fail closed on malformed JSON payload extraction
- Prefer partial summaries over full endpoint failure when one source is temporarily unavailable, if the degradation can be represented honestly

### Frontend

- Render loading, empty, and error states clearly
- If detail fetch fails, keep the drawer shell open with an inline error instead of collapsing context
- If one section cannot load, preserve the rest of the page where possible

## Security

- Analytics remains read-only
- Reuse the dashboard’s existing authenticated backend model
- Do not expose filesystem paths or secret material beyond what is already safe for operator visibility
- Raw payload display should remain faithful but should not bypass any existing secret/redaction policy already applied upstream

## Testing Strategy

### Backend

Add focused tests for:

- summary aggregation
- normalized event mapping
- session filtering
- rejection/error/failure counting
- event detail lookup

### Frontend

Add tests for:

- analytics route becoming live
- global default view rendering
- summary cards
- session filter narrowing results
- row click opening drill-down drawer
- empty/error/loading states

### Integration

Add at least one end-to-end style test proving the dashboard can render analytics data backed by representative observer/governor/failure records.

## Rollout Scope

### Included In V1

- live analytics route
- read-only summary cards
- filter bar
- activity table
- decisions/failures table
- detail drawer
- session drill-down
- rejection/error/failure/security counts

### Deferred

- charts and trend visualizations
- export/download
- saved views
- write actions
- deep cross-linking beyond simple Beast/run/session navigation

## File-Level Direction

Expected work will primarily touch:

- `packages/franken-web` for the analytics UI and client
- `packages/franken-orchestrator` for read-only analytics endpoints and aggregation

The feature should follow the existing dashboard and HTTP route patterns rather than introducing a second dashboard architecture.

## Open Risks

- Observer/governor/security payloads may not line up perfectly and will require careful normalization
- Some desired "doesn't work as expected" signals may not yet be recorded explicitly, so v1 may need to derive them from existing run/agent state
- Large event payloads could make drawer rendering noisy unless normalization is disciplined

## Recommendation

Implement the analytics section as a backend-aggregated, read-only operator surface inside the existing dashboard. Default to global activity, make session filtering the primary drill-down tool, and focus the first cut on clear counts plus searchable, inspectable tables rather than charts.
