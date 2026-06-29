# ADR-035: Central in-process governance on the MCP dispatch path

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
- The gate classifies tools by **actual risk**, not just payload text
  (`shared/governance-gate.ts`):
  - Read-only safety/meta tools (`fbeast_firewall_scan`,
    `fbeast_firewall_scan_file`, `fbeast_governor_check`, `search_tools`) are
    **exempt** — their input is the thing being vetted, so routing the payload
    through the destructive-pattern governor would self-block the very
    scan/check they exist to perform (e.g. scanning the text "delete all files").
  - Known-destructive fbeast tools the word heuristic misses
    (`fbeast_memory_forget`) are **escalated** to at-least-`review_recommended`
    when the governor would otherwise approve, so a benign payload cannot
    auto-approve a mutating call. A stricter governor decision is never
    downgraded.
- The central audit records **what was attempted**, not just success/failure:
  `dispatchTool` and the proxy record the validated `args` and, for blocked
  calls, the governance `decision` (`denied`/`review_recommended`/`error`).
  Crucially, **denials and fail-closed gate errors are audited too** (with
  `ok: false`) — the highest-risk events — rather than vanishing because the
  handler never ran.
- `createAuditSink` resolves the fallback session id **once per sink/process**
  (when neither `FBEAST_SESSION_ID` nor `CLAUDE_SESSION_ID` is set), so a single
  long-running server's events share one session and `fbeast_observer_trail`
  can reconstruct the run instead of scattering each record under a fresh UUID.

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
