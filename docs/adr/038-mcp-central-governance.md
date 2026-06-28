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
- Enforcement **fails closed**: a `denied` decision short-circuits the handler
  with an `isError` result, and any error thrown by the gate is treated as a
  denial.
- A new `shared/governance-gate.ts` exposes `createGovernanceGate(dbPath | GovernorAdapter)`,
  which wraps the **same** `GovernorAdapter` the hook path uses
  (`adapters/governor-adapter.ts`), so server-side and hook-based enforcement
  apply identical policy. The governor is created lazily on first check to
  preserve the proxy's lazy-DB semantics.
- The two aggregate, user-facing runtime entry points are wired to inject the
  gate by default: `beast.ts` (the `fbeast` all-in-one server, reusing its
  already-constructed governor adapter) and `servers/proxy.ts` (the
  `fbeast-proxy` server).

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
  `governance` would not be governed. Mitigation: the gate is injected at the
  aggregate entry points users actually run (`fbeast`, `fbeast-proxy`).
  Individual standalone single-purpose servers can opt in by passing the same
  gate; the central mechanism is in place for them.
- Over-broad denials are possible if governor patterns are too aggressive; the
  governor's existing pattern set is reused unchanged.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Make hooks default-on | Small change | Still client-side and removable; server stays ungoverned | Does not fix the root cause (server dispatch) |
| Rely on AGENTS.md guidance | Zero code | Advisory only; trivially bypassed | Not enforcement |
| Hard-code governor into `createMcpServer` (no DI) | Always on | Forces sqlite/governor deps into the factory; breaks pure-factory tests; no dbPath available | Dependency injection keeps the factory pure and testable |
