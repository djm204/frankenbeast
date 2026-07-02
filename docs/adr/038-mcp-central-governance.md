# ADR-038: Central in-process governance on the MCP dispatch path

- **Date:** 2026-06-28
- **Status:** Accepted
- **Deciders:** frankenbeast maintainers

## Context

Finding ARCH-003 (P0, GitHub issue #361): MCP governance/security was
hook-dependent, not centrally enforced.

`createMcpServer` in `packages/franken-mcp-suite/src/shared/server-factory.ts`
dispatches every `CallTool` request through `dispatchTool` straight to the tool
handler. The only automatic firewall/governor/observer enforcement was an
*opt-in* client hook (`fbeast-hook pre-tool`), installed only when `fbeast init`
is run with `--hooks` (default `hooks=false`, see `cli/init-options.ts`). The
proxy server (`servers/proxy.ts`) is the highest-risk surface because its
`execute_tool` can run any registry tool, and it too dispatched directly.

Consequence: if hooks are not installed, a user or model could call fbeast MCP
tools with no firewall scan, no governor approval, and no audit — security was
advisory (relying on AGENTS.md compliance) rather than mandatory.

## Decision

Add a central, in-process governance gate on the server-side dispatch path so
tool calls are checked regardless of whether client hooks are installed. We
**add** this layer; we do **not** remove the hook mechanism.

- `server-factory.ts` gains a `GovernanceGate` interface and a
  `CreateMcpServerOptions.governance` option. `dispatchTool` consults the gate
  **after** argument validation and **before** the handler runs. The gate is the
  single enforcement point shared by both the MCP `CallTool` handler and the
  in-process `callTool` method.
- Enforcement **fails closed**: any decision other than `approved` (i.e.
  `denied` **or** `review_recommended`) short-circuits the handler with an
  `isError` result, and any error thrown by the gate is treated as a denial.
  This matches the hook path (`cli/hook.ts`), which rejects every non-`approved`
  decision — important because the default governor maps high-severity
  destructive matches to `review_recommended`, not `denied`.
- A new `shared/governance-gate.ts` exposes `createGovernanceGate(dbPath | GovernorAdapter)`,
  which wraps the **same** `GovernorAdapter` the hook path uses
  (`adapters/governor-adapter.ts`), so server-side and hook-based enforcement
  apply identical policy. The governor is created lazily on first check to
  preserve the proxy's lazy-DB semantics.
- `server-factory.ts` also gains an `AuditSink` (`CreateMcpServerOptions.audit`):
  after every dispatched call `dispatchTool` records the tool + result status,
  mirroring the post-tool hook's observer logging so the central path yields an
  `audit_trail` record even with hooks absent. Audit is best-effort and never
  fails the tool call. `shared/central-enforcement.ts` provides
  `createAuditSink` and `createCentralOptions(dbPath)` (governance + audit).
- **Every** runtime MCP server entry point injects the central enforcement by
  default, not just the aggregate ones: `beast.ts` (`fbeast`, reusing its
  governor/observer), and each standalone single-purpose server
  (`fbeast-memory`, `fbeast-planner`, …) via `createCentralOptions(dbPath)` in
  its CLI entry. This closes the gap where the default `fbeast init` standard
  mode (`hooks=false`) registered ungoverned standalone binaries.
- `servers/proxy.ts` applies the gate and audit to the **resolved target tool**
  inside the `execute_tool` handler (after registry lookup), not to the
  `execute_tool` meta-tool, so policy and audit are keyed by the real high-risk
  action (e.g. `fbeast_memory_forget`) rather than the generic wrapper.
- The gate classifies tools by **behavior**, not by payload keywords
  (`shared/governance-gate.ts`). The governor's destructive-word heuristic is
  correct for shell/CLI actions, but for fbeast tools the dangerous word
  normally appears in the tool's *data payload* (the text being critiqued, the
  value being stored, the event being logged), not in the operation itself.
  Scanning that payload only yields false-positive denials, so:
  - **Non-executing tools** (`NON_EXECUTING_TOOLS`) — every read/analyze/store/
    log tool across the registry (`search_tools`, the firewall scanners,
    `fbeast_governor_check`/`_budget`, `fbeast_memory_store`/`_query`/
    `_frontload`, the planner tools, `fbeast_critique_evaluate`/`_compare`, the
    observer tools, the skills tools) — are **exempt** and approved. Their
    payload is data, not an operation to authorize; governing it would break
    legitimate critique/audit/store workflows on risky content (e.g. critiquing
    code containing `DROP TABLE`, or logging an event mentioning `rm -rf`).
  - **Everything else** falls through to the governor with its payload —
    fail-closed by default for any tool we have not vetted.
- **Destructive-tool classification lives in the shared governor adapter**, not
  in the central gate. fbeast tools whose name the word heuristic misses but
  which mutate state (`DESTRUCTIVE_ACTIONS`, e.g. `fbeast_memory_forget`) are
  flagged inside `adapters/governor-adapter.ts` (`isDestructive`), so a single
  policy drives **every** caller — the client hook, the public
  `fbeast_governor_check` tool, the `governor_log` record, and the central
  dispatch gate — and they all return the same decision for the same action. An
  earlier revision overrode the decision only in the gate, which made central
  dispatch disagree with the governor log / hook / check tool; that override was
  removed in favour of the shared classification.
- The central audit records **what was attempted**, not just success/failure:
  `dispatchTool` and the proxy record the `args` and a `decision` classifier for
  every non-success path — governance `denied`/`review_recommended`, a
  fail-closed gate `error`, an `unknown_tool` probe, and a `validation_error`
  (malformed payload). Crucially, **rejected probes, denials, and gate errors
  are all audited** (with `ok: false`) — the highest-risk events — rather than
  vanishing because the handler never ran. Pre-validation rejections record the
  raw (possibly malformed) payload so the attempt is still reconstructable.
  - The proxy's `execute_tool`/`search_tools` wrapper is validated by the
    factory *before* its custom handler runs, so malformed proxy probes (missing
    or non-object `args`, non-string `tool`, unknown tool) never reach the
    target-level audit. The proxy therefore wires a **wrapper audit** that
    forwards *only* those pre-handler rejections (`validation_error`/
    `unknown_tool`); it deliberately drops the post-handler `execute_tool`
    record so a successful proxied call is audited once (by its resolved target),
    not twice, and read-only `search_tools` listings stay unaudited.
- `createAuditSink` resolves the session id **once per sink/process**: an
  explicit `FBEAST_SESSION_ID`/`CLAUDE_SESSION_ID` is preferred for real
  per-run correlation, but when neither is set (the default `fbeast init`
  standard install) it falls back to a **documented constant**
  (`DEFAULT_AUDIT_SESSION_ID = 'fbeast-central-dispatch'`) rather than a random
  UUID. `fbeast_observer_trail` requires the caller to supply a session id, so a
  random fallback would be unretrievable; the constant means the central trail
  is always queryable via
  `fbeast_observer_trail({ sessionId: 'fbeast-central-dispatch' })` and every
  standalone server on the same DB writes under that one id.

### Relationship to hooks

Hooks remain supported and unchanged. They provide enforcement at the *client*
boundary (e.g. governing the host agent's own tool calls and post-tool
observer logging). The central gate provides enforcement at the *server*
boundary so fbeast MCP tools cannot be invoked ungoverned even with hooks
absent. The two are complementary and share the same governor policy.

## Consequences

### Positive
- Governance for fbeast MCP tools is mandatory at dispatch, not opt-in.
- One enforcement point (`dispatchTool`) covers both the MCP transport and the
  in-process `callTool` API.
- Server and hook paths reuse the identical governor, so policy cannot drift.
- Fail-closed semantics: gate errors deny rather than silently allow.

### Negative
- A governor check (and a `governor_log` insert) now runs on every dispatched
  call through a governed server, adding minor latency/IO per call.

### Risks
- A future server constructed via `createMcpServer` without passing
  `governance`/`audit` would not be governed/audited. Mitigation: every runtime
  entry point (`fbeast`, `fbeast-proxy`, and all standalone `fbeast-*` servers)
  now injects `createCentralOptions(dbPath)`; the `.tools`-only consumers (e.g.
  `beast.ts` reading a factory's tool list) intentionally pass nothing.
- Over-broad denials are possible if governor patterns are too aggressive; the
  governor's existing pattern set is reused unchanged. Because the gate now
  blocks `review_recommended` server-side, destructive-pattern calls are denied
  rather than allowed-with-a-note when hooks are absent.
- When hooks **are** installed, fbeast tool calls are audited at both the client
  boundary (post-tool hook) and the server boundary (central audit). The
  central record is tagged `source: "central-dispatch"` to keep the two
  distinguishable; the redundancy is accepted as the central path's value is
  precisely the hooks-absent default.

### Out of scope
- Firewall (prompt-injection) scanning is **not** added to the dispatch gate.
  The hook path does not firewall-scan either (`cli/hook.ts pre-tool` only runs
  the governor); the firewall is an agent-invoked tool (`fbeast_firewall_scan` /
  `_scan_file`) for vetting untrusted input before acting. Making it a blocking
  per-dispatch gate would self-block those scan tools (it would refuse to scan
  the very content meant to be scanned) and cause false-positive denials on
  legitimate stores. Defense-in-depth firewall integration, if desired, belongs
  in a separate decision rather than bolted onto the governor gate.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Make hooks default-on | Small change | Still client-side and removable; server stays ungoverned | Does not fix the root cause (server dispatch) |
| Rely on AGENTS.md guidance | Zero code | Advisory only; trivially bypassed | Not enforcement |
| Hard-code governor into `createMcpServer` (no DI) | Always on | Forces sqlite/governor deps into the factory; breaks pure-factory tests; no dbPath available | Dependency injection keeps the factory pure and testable |
