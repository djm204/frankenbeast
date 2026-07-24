# ADR-041: Hive Brain command center

- **Date:** 2026-07-24
- **Status:** Accepted
- **Deciders:** Frankenbeast maintainers
- **Supersedes:** none
- **Related:** ADR-014, issues #3685, #3690, #3695, #3700, #3701, #3702, and #3703

## Context

Frankenbeast already exposes project-scoped chat sessions through REST and the
`franken.chat.v1` WebSocket protocol. A `ChatSession` persists the transcript,
turn state, pending approval, provider context, token totals, and an optional
in-progress Beast interview. Both REST and WebSocket input enter the shared
`ChatRuntime`; Beast launch requests then use the existing chat dispatch adapter
and Beast control plane.

The Hive Brain epic adds a workspace-scoped command center above individual
agent-type brains. Before implementing it, four choices must be fixed: whether
central-command chat replaces the existing transport, what a
`BrainConversation` owns, how it relates to the planned `BrainRegistry`, and
where Beast dispatch crosses the safety boundary.

The local Beast construction path now has one concrete faculty integration:
`ReasoningFacultyAdapter` attaches the existing `@franken/critique` chain to a
run's `SqliteBrain` and records recallable verdict episodes. That agent-scoped,
per-run wiring does not provide the workspace Hive registry, conversation
aggregate, or cross-faculty routing decided here.

## Decision

### 1. Extend the existing chat transport

The command center has exactly one persistent brain conversation per
`(workspaceId, subjectId)`. A newly created chat session with no explicit
lower-level agent/run attachment binds to that existing conversation (creating
it only when none exists). The conversation does **not** replace `/v1/chat/ws`
and does not add a parallel socket protocol. Existing clients continue to use:

- `POST /v1/chat/sessions` and `GET /v1/chat/sessions/:id` for creation and
  reconciliation;
- `POST /v1/chat/sessions/:id/socket-ticket` followed by `/v1/chat/ws` with the
  `franken.chat.v1` subprotocol for live turns; and
- the current strict `ClientSocketEventSchema` and `ServerSocketEventSchema`,
  including opt-in feature extensions.

`ChatSession` remains a transport/view binding with its own `id` and a durable
`conversationId`. Existing sessions explicitly attached to one agent/run remain
supported lower-level debug/attach views and are not silently reinterpreted as
the command center. The server resolves the binding, conversation, and brain
before calling `ChatRuntime`. Transport handlers remain adapters: they
authenticate, enforce admission/rate limits, load state, invoke the runtime
once, persist the result, and project it back into the v1 response/event shapes.
Business routing does not move into `franken-web` or the WebSocket controller.

Additive identifiers may be exposed in REST and WebSocket snapshots only after
the shared `@franken/types` schemas support them. Strict v1 socket events must
not receive unnegotiated fields. No existing URL, event name, receipt sequence,
approval event, or reconnect behavior changes as part of the Hive Brain work.

### 2. `BrainConversation` is durable conversation state, not a brain

`BrainConversation` is a workspace-scoped aggregate with this minimum canonical
shape:

| Field | Contract |
| --- | --- |
| `id` | Stable command-center conversation identifier, independent of transport session ids. |
| `workspaceId` | Stable workspace/project namespace; initially derived from `projectId`. |
| `subjectId` | Stable authenticated user/operator principal. Local single-operator mode uses the explicit `local-operator` principal. |
| `brainKey` | Required namespaced key for one workspace-scoped Hive Brain in `BrainRegistry`. |
| `facultyId` | Optional selected faculty/agent-type brain; `null` means the Hive Brain command center handles the turn. |
| `transcript` | Ordered user/assistant/system messages, preserving message ids and timestamps. |
| `state` | Current turn/approval lifecycle state. |
| `pendingApproval` | Durable, redacted-on-read approval state; secret execution metadata remains server-side. |
| `beastContext` | Optional in-progress Beast interview binding. |
| `supervisedAgents` | Durable associations to tracked agents/runs known to this conversation, including type, status, and last-observed timestamp. |
| `crossAgentSummary` | Compact recent summary derived from hive-mind data; it is refreshable state, not the authoritative run record. |
| `providerContext`, `routingMetadata` | Last provider result and auditable brain/faculty routing facts. |
| `tokenTotals`, `costUsd` | Durable accounting values. |
| `createdAt`, `updatedAt` | Persistence timestamps. |

`subjectId` is derived server-side from the authenticated principal; the
browser cannot choose another subject in `CreateSessionBody` or socket events.
Until multi-user identity exists, authenticated local operation deliberately
maps to the single `local-operator` principal rather than using an unstable
token, IP address, or browser-generated id.

A conversation owns conversational history, resumable turn state, supervised
agent associations, and the recent cross-agent summary. Its repository is
backed by the workspace Hive Brain's durable namespace, through a dedicated
conversation repository/port; callers must not encode this aggregate as ad-hoc
working-memory keys. It does not own faculty definitions, instantiate a second
registry, or duplicate authoritative run/hive-mind records. The selected Hive
Brain/faculty reads memory through the brain package's existing ports, while the
conversation repository gives the aggregate explicit schema/version and atomic
write semantics.

All writes are atomic at the aggregate boundary. The existing mutation-admission
mechanism is reused but keyed by canonical `conversationId` for command-center
bindings (and by session id only for an unbound legacy view). This prevents two
browser sessions bound to the same user/workspace conversation from mutating it
concurrently. Corrupt or missing conversation records fail closed and surface
through the existing reconciliation/diagnostic path; the server must not
silently create a replacement and lose approval or transcript state.

### 3. Use the same `BrainRegistry` with separate key namespaces

Issue #3685's `BrainRegistry` remains the sole in-process registry. Its required
`forAgentType(agentTypeId)` API and stable per-agent-type instances remain
unchanged. Hive work extends that class additively with
`forWorkspaceHive(workspaceId)`; both methods share the registry lifecycle but
use disjoint canonical keys (`agent-type:<id>` and `workspace-hive:<id>`) so a
workspace cannot collide with an agent type. No second Hive registry is added.

The registry owns stable brain instance lookup. Faculty/capability metadata and
health come from the faculty/hive-mind work that consumes those instances; this
ADR does not retrofit unrequested metadata fields into #3685. The conversation
stores its `workspace-hive:<id>` brain key and the faculty selected for each turn
in `routingMetadata`. This keeps central-command chat one level above faculties
without inventing a separate "conversation brain" lifecycle.

If a requested faculty is missing or unhealthy, routing fails as a typed,
visible turn error or falls back to the Hive Brain only when policy explicitly
allows that fallback. It never dispatches to an unregistered implementation.

### 4. Migrate without breaking `franken-web`

Existing `ChatSession` JSON records remain valid lower-level sessions. Migration
does not collapse their unrelated transcripts into one command-center history.
On the first default command-center session for a `(workspaceId, subjectId)`, the
server atomically resolves or creates the one `BrainConversation`, then persists
`chatSession.conversationId`. It may import existing tracked-agent associations
for that workspace from hive-mind/run data, but legacy transcripts remain with
their original sessions unless an explicit import is designed later.

The migration is additive and restart-safe. A compatibility adapter presents
the existing `ISessionStore` contract: for command-center bindings it projects
the canonical conversation state into current session responses; for explicit
legacy agent/run bindings it serves the unchanged session record. One
transaction (or recoverable journal when the stores cannot share a transaction)
must persist conversation state plus binding metadata per turn; independent
dual writes are forbidden because they can split approval state from transcript
state. Schema/version markers distinguish bindings and canonical records.
Rollback keeps serving legacy records without deleting canonical conversation
data.

`franken-web` remains compatible throughout: it creates/resumes sessions as it
does today, receives `session.ready`, sends `message.send` and
`approval.respond`, and reconciles with `GET /v1/chat/sessions/:id`. Hive/faculty
controls are later additive UI work; absence of those controls means
`facultyId = null`, not a legacy or ungated execution path.

### 5. Reuse the governed Beast dispatch seam

A routed turn that requests a Beast follows this invariant:

```text
franken-web / REST / comms
  -> ChatRuntime
  -> BeastDispatchPort (local ChatBeastDispatchAdapter or daemon adapter)
  -> tracked-agent interview/init
  -> BeastDispatchService.createRun
  -> normal Beast executor and governor/HITL policy
```

The Hive Brain may choose a registered faculty or propose a Beast definition and
configuration. It may not start a process/container, write a run directly to the
repository, synthesize an approval, or call an executor outside this path.
Existing authentication, mutation admission, maintenance mode, capacity
reservation, role/tool manifest checks, approval audit/replay protection, and
governor/HITL decisions remain authoritative. A denial, unavailable dependency,
unsafe approval payload, or policy error fails closed and is persisted/emitted
using the current chat and Beast failure contracts.

The current code proves the shared structural seam but does not expose a direct
`IGovernorModule` call inside `BeastDispatchService.createRun`. Therefore #3703
must first characterize the old per-session path with the required denied/
unapproved integration test. If that test exposes a missing governor decision,
the fix belongs once in this shared adapter/service/execution seam so both old
and brain-conversation callers fail identically; adding a brain-only gate or
claiming the service is already gated without evidence is not acceptable.

`dispatchedBy = "chat"`, the conversation/session correlation ids, selected
`brainKey`/`facultyId`, and routing reason must be retained as audit metadata.
The browser receives redacted approval state only; privileged approval tokens,
requester/workdir details, and Beast operator credentials never enter bundled
client state.

## Turn sequence

1. Authenticate the REST request or one-shot WebSocket ticket.
2. Resolve the session binding; load the unique `BrainConversation` and resolve
   `brainKey` plus optional `facultyId`
   through `BrainRegistry`.
3. Acquire the existing mutation admission lock keyed by `conversationId` (or
   the legacy session id for an unbound lower-level session).
4. Invoke `ChatRuntime` with the persisted transcript, approval, provider,
   routing, and Beast-interview state.
5. For conversational work, route to the Hive Brain or selected registered
   faculty. For Beast work, use `BeastDispatchPort` and the existing control
   plane exactly as described above.
6. Atomically persist the resulting aggregate before emitting completion.
7. Emit only v1-compatible events; after reconnect, `session.ready` and the REST
   session projection are the source of truth.

## Failure and recovery rules

- Registry lookup failure, invalid brain/faculty ownership, or conversation
  corruption is explicit and fail-closed.
- A socket disconnect does not cancel or duplicate an accepted turn. Clients
  reconcile through the existing session GET and fresh one-shot socket ticket.
- At most one turn mutates a conversation at a time.
- Approval remains durable across restart and cannot be replayed.
- A post-dispatch persistence failure reports an error and is repaired from the
  Beast run/audit correlation; it must not create a second run on retry.
- Telemetry and routing metadata must not contain prompts, credentials, or
  unredacted approval secrets.

## Implementation boundaries

This ADR is documentation only. Runtime work remains split as follows:

- **#3701 — entity and persistence:** add versioned `BrainConversation` schemas,
  uniqueness for `(workspaceId, subjectId)`, Hive-Brain-backed repository,
  supervised-agent/summary state, compatibility projection/binding migration,
  atomicity, corruption, and restart tests.
- **#3702 — hive-aware query/routing:** resolve the workspace Hive Brain and
  optional faculty from `BrainRegistry`, record routing metadata, and expose
  additive typed API fields without changing v1 transport behavior.
- **#3703 — dispatch integration:** feed routed Beast requests through
  `BeastDispatchPort`/`BeastDispatchService`, preserving governor/HITL, auth,
  admission, audit, capacity, and idempotency behavior.

Those issues remain blocked until this decision is merged. Issue #3685 must
provide the registry contract before #3701 or #3702 can bind persisted foreign
keys to it.

## Consequences

### Positive

- Existing CLI and browser chat clients continue to work unchanged.
- One durable aggregate becomes the source of truth for transcript, routing,
  approval, and resumable Beast interview state.
- One registry governs Hive and faculty identities.
- Central-command dispatch cannot bypass the established safety/control plane.
- The three implementation issues have explicit, non-overlapping contracts.

### Negative

- A compatibility projection/migration is required before `ChatSession` can be
  retired as the persisted name.
- The registry dependency makes #3685 a hard prerequisite.
- Strict v1 WebSocket schemas require deliberate feature negotiation for future
  additive fields.

## Alternatives rejected

- **Replace `/v1/chat/ws`:** unnecessary client breakage and duplicate reconnect,
  receipt, auth, and approval semantics.
- **Add `/v1/brain/ws`:** creates two live-turn protocols that will drift.
- **Treat each conversation as a brain:** conflates memory/identity lifecycle
  with transcript lifecycle and multiplies registry entries.
- **Create a separate Hive registry:** duplicates health, capability, and
  ownership rules from `BrainRegistry`.
- **Dispatch directly from the Hive Brain:** bypasses existing policy, audit,
  capacity, and execution safeguards.
