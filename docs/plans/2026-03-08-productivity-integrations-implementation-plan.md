# Productivity Integrations — Implementation Plan

**Date:** 2026-03-08
**Status:** Proposed
**Scope:** Cross-module

## Goal

Add secure access to structured productivity systems, starting with:

- Google Sheets
- Google Calendar

The architecture should also be extensible to related APIs later, such as:

- Google Docs
- Google Slides
- Gmail

These are not file-store features. They are structured SaaS integrations with domain-specific actions, permissions, and risks.

---

## Relationship to Other Plans

This plan depends on:

- the shared chat interface and `ConversationEngine`
- the secure token and provider-connection substrate from the file-store plan

It should reuse the same secure connection model, but expose separate tools and policies for:

- spreadsheet reads and writes
- calendar reads and writes
- document-aware operations later

---

## Security Posture

This integration must be secure by default.

Rules:

- narrow OAuth scopes
- read-only by default
- write access opt-in
- encrypted token storage
- project and actor authorization on every operation
- strict schema validation
- audit every mutation
- HITL for high-risk actions

High-risk actions include:

- modifying many cells at once
- overwriting formulas
- deleting sheets or events
- sending or updating external invites
- modifying shared calendars

---

## Recommended Package Shape

Create a new package: `franken-productivity`

```text
franken-productivity/
├── src/
│   ├── core/
│   │   ├── types.ts
│   │   ├── provider-types.ts
│   │   ├── config.ts
│   │   ├── policy.ts
│   │   └── errors.ts
│   ├── auth/
│   │   ├── connection-store.ts
│   │   └── oauth-scopes.ts
│   ├── sheets/
│   │   ├── sheets-provider.ts
│   │   ├── range-parser.ts
│   │   ├── mutation-guard.ts
│   │   └── renderer.ts
│   ├── calendar/
│   │   ├── calendar-provider.ts
│   │   ├── event-policy.ts
│   │   ├── timezone.ts
│   │   └── renderer.ts
│   ├── docs/
│   │   └── docs-provider.ts
│   ├── gateway/
│   │   ├── productivity-service.ts
│   │   ├── registry.ts
│   │   └── tool-adapter.ts
│   ├── server/
│   │   ├── app.ts
│   │   ├── routes.ts
│   │   └── middleware.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
```

---

## Core Abstractions

Define distinct provider interfaces, not one generic "workspace blob" interface.

### Sheets

```ts
interface SpreadsheetProvider {
  listSpreadsheets(input: ListSpreadsheetsInput): Promise<ListSpreadsheetsResult>;
  readRange(input: ReadRangeInput): Promise<ReadRangeResult>;
  appendRows?(input: AppendRowsInput): Promise<AppendRowsResult>;
  updateCells?(input: UpdateCellsInput): Promise<UpdateCellsResult>;
}
```

### Calendar

```ts
interface CalendarProvider {
  listCalendars(input: ListCalendarsInput): Promise<ListCalendarsResult>;
  listEvents(input: ListEventsInput): Promise<ListEventsResult>;
  createEvent?(input: CreateEventInput): Promise<CreateEventResult>;
  updateEvent?(input: UpdateEventInput): Promise<UpdateEventResult>;
  deleteEvent?(input: DeleteEventInput): Promise<void>;
}
```

Important:

- read operations ship first
- mutation methods remain optional until explicitly enabled
- raw provider payloads do not cross the package boundary

---

## OAuth Scope Strategy

## Google Sheets

Read-only default:

- `https://www.googleapis.com/auth/spreadsheets.readonly`

Write scope only if needed:

- `https://www.googleapis.com/auth/spreadsheets`

If Drive-backed discovery is needed, use the narrowest additional Drive scope possible.

## Google Calendar

Read-only default:

- `https://www.googleapis.com/auth/calendar.readonly`

Write scope only if needed:

- `https://www.googleapis.com/auth/calendar.events`

Avoid requesting broad account scopes by default.

---

## Sheets Security Model

Sheets are deceptively risky because structured data can become executable or silently corrupted.

### Risks

- formula injection
- bulk accidental overwrite
- writing outside approved ranges
- leaking sensitive tabs
- tampering with financial or operational data

### Required controls

- approved spreadsheet allowlist or project binding
- optional tab allowlist
- optional range allowlist
- row/column/cell mutation limits
- formula-write policy
- read-only default
- immutable audit log for all writes

### Formula safety

If the system writes user-provided values to cells, it must defend against formula injection.

At minimum:

- detect values starting with `=`, `+`, `-`, `@`
- treat them as formulas only if explicitly allowed
- otherwise coerce to literal text

### Mutation policy

Supported v1 writes should be narrow:

- append rows
- update a small, explicit range

Do not ship broad sheet rewrite actions in v1.

---

## Calendar Security Model

Calendar operations can cause real-world impact.

### Risks

- inviting external recipients
- changing or canceling events unexpectedly
- timezone mistakes
- impersonation through shared calendars
- leaking sensitive schedules

### Required controls

- calendar allowlist
- organizer identity mapping
- timezone normalization
- participant policy
- external attendee policy
- audit every event mutation

### High-risk actions

These should require HITL or equivalent governance:

- creating events with external attendees
- modifying shared-team calendars
- deleting events
- changing start/end times for existing meetings
- sending invites or updates broadly

### Safe defaults

- read-only default
- no attendee mutation without explicit configuration
- no deletion enabled by default

---

## Canonical Entity Models

### Spreadsheet

- `spreadsheetId`
- `provider`
- `title`
- `ownerId`
- `projectId`
- `allowedSheets`
- `allowedRanges`
- `capabilities`

### Calendar

- `calendarId`
- `provider`
- `title`
- `timezone`
- `ownerId`
- `projectId`
- `allowsExternalInvites`
- `capabilities`

### Event

- `eventId`
- `calendarId`
- `title`
- `start`
- `end`
- `timezone`
- `attendeeCount`
- `source`

---

## API Surface

Use Hono.

Suggested endpoints:

### Connections

- `POST /v1/productivity/connections/google/start`
- `GET /v1/productivity/connections/google/callback`
- `GET /v1/productivity/connections`

### Sheets

- `GET /v1/productivity/sheets`
- `GET /v1/productivity/sheets/:id/range`
- `POST /v1/productivity/sheets/:id/append`
- `POST /v1/productivity/sheets/:id/update`

### Calendar

- `GET /v1/productivity/calendars`
- `GET /v1/productivity/calendars/:id/events`
- `POST /v1/productivity/calendars/:id/events`
- `PATCH /v1/productivity/calendars/:id/events/:eventId`
- `DELETE /v1/productivity/calendars/:id/events/:eventId`

Every endpoint must be:

- authenticated
- authorized
- schema validated
- rate limited
- audited

---

## Tooling Integration

These integrations should be exposed to the agent as governed tools, not raw API passthrough.

Examples:

- `read_sheet_range`
- `append_sheet_rows`
- `list_calendar_events`
- `create_calendar_event`

Each tool should accept narrow, typed parameters and return structured results.

Do not expose arbitrary provider query execution or scriptable macro surfaces in v1.

---

## MCP and Chat Integration

These tools can later be surfaced through MCP or native tool definitions, but the authority should remain in `franken-productivity`.

Recommended flow:

- chat requests a sheet or calendar action
- tool adapter validates requested action
- provider policy checks connection, target, and permission
- service executes and records telemetry
- result is summarized back into chat

The agent should not see refresh tokens or raw provider auth details.

---

## Observability and Audit

Record for every operation:

- actor
- project
- provider
- target spreadsheet/calendar
- action type
- read vs write
- rows/cells affected or attendees affected
- status
- latency
- token/cost context if triggered from a chat/execution session

This should feed the dashboard work so operators can answer:

- which sheets/calendars are being touched
- by whom
- how often
- which actions fail
- which actions trigger approvals

---

## Threat Model

Primary threats:

- OAuth token theft
- over-broad scopes
- unauthorized sheet/calendar access
- formula injection into spreadsheets
- accidental bulk data corruption
- unauthorized external meeting invites
- schedule leakage
- malicious or malformed provider payloads
- logging of sensitive meeting or spreadsheet data

Every phase should be reviewed against those threats.

---

## Phased Delivery

## Phase 0 — ADRs and Threat Model

Deliverables:

- ADR for secure productivity integration boundary
- ADR for read-only-by-default mutation policy
- written threat model for sheets and calendar actions

Tests:

- config and scope validation
- fail-closed startup when secrets/scopes are invalid

## Phase 1 — Shared Connection and Policy Substrate

Reuse the secure OAuth/token substrate from `franken-files`.

Deliverables:

- connection records
- scope validation
- project/actor authorization policy
- audit recorder

Tests:

- provider connection cannot be used cross-project
- insufficient scope blocks the action

## Phase 2 — Sheets Read-Only

Deliverables:

- spreadsheet discovery
- read range
- renderer for small result sets
- range allowlist policy

Tests:

- disallowed sheet or range rejected
- large range requests capped
- provider errors mapped cleanly

## Phase 3 — Calendar Read-Only

Deliverables:

- calendar discovery
- list events
- timezone-safe normalization

Tests:

- date range validation
- timezone normalization correctness
- unauthorized calendars rejected

## Phase 4 — Sheets Write Actions

Deliverables:

- append rows
- narrow update cells
- mutation guard
- formula safety controls

Tests:

- formula-like input coerced safely unless explicitly allowed
- bulk mutation beyond policy limit rejected
- audit entry recorded with affected range

## Phase 5 — Calendar Write Actions

Deliverables:

- create event
- update event
- guarded delete path
- attendee policy enforcement

Tests:

- external invite requires approval when configured
- delete blocked by default
- unsafe timezone or attendee changes rejected

## Phase 6 — Docs/Slides Extension Hooks

Deliverables:

- extensible registry for future Docs and Slides adapters
- shared connection reuse
- no-op scaffolding until actual provider implementations are required

Tests:

- registry and capability checks

## Phase 7 — API and Agent Tool Wiring

Deliverables:

- Hono server
- governed tools for chat and execution use
- observer/dashboard telemetry integration

Tests:

- chat tool cannot bypass policy
- validation failures return structured errors
- high-risk actions route to approval flow

## Phase 8 — Hardening

Deliverables:

- token revocation handling
- secret rotation support
- data retention policy
- redaction rules for logs and traces

Tests:

- revoked connection fails cleanly
- rotated keys still decrypt old tokens by version
- secrets and sensitive fields are redacted

---

## Recommended Delivery Order

1. Secure connection substrate
2. Sheets read-only
3. Calendar read-only
4. Sheets writes
5. Calendar writes
6. Tool and chat integration
7. Docs/Slides extension hooks
8. Hardening

This keeps the highest-risk mutations later and proves read-path correctness first.

---

## First Milestone

The first meaningful milestone is:

**"Frankenbeast can securely connect to Google, read an approved spreadsheet range and list events from an approved calendar, with encrypted tokens, narrow scopes, policy enforcement, and audit logs."**

Do not enable writes before that works reliably.

---

## Exit Criteria

This effort is complete when:

- Sheets and Calendar are available as governed tools
- read-only access is secure and reliable
- mutations are opt-in and policy-protected
- tokens are encrypted and rotatable
- spreadsheet formula injection is handled safely
- external calendar side effects are approval-gated where needed
- telemetry and audits are complete
- future Docs/Slides integrations can plug into the same substrate cleanly

