# ADR-035: MCP Input Validation & Path Containment

- **Date:** 2026-05-18
- **Status:** Accepted
- **Deciders:** pfk (with Claude Code), per security-hardening Chunk 2

## Context

The 2026-04-28 agent-systems audit (Pillar 1 — Secure Code Execution) found two
input-boundary gaps, re-verified against `main` on 2026-05-17:

- **MCP tool schemas were metadata, not enforced.** `createMcpServer` passed raw
  `args` straight into tool handlers; advertised `inputSchema`
  (required/type/extra-property) was never checked. Handlers coerced with
  `String(args['...'])`.
- **`fbeast_firewall_scan_file` read arbitrary supplied paths.** The adapter's
  `scanFile` forwarded the caller's path to `readFileSync` with no
  repository/root containment, so absolute or `../` paths were read.

## Decision

Self-contained to `franken-mcp-suite`; no cross-package changes:

- Add `validateToolArguments(tool, args)` and route **both** the SDK
  `CallToolRequestSchema` handler and a new in-process
  `FbeastMcpServer.callTool(name, args)` through a single shared `dispatchTool`.
  Every tool now inherits structural validation from its declared
  `inputSchema` before its handler runs: object-shape, required properties,
  primitive `type` (with `integer` special-cased via `Number.isInteger`), and
  rejection of unknown extra properties. `callTool` is the single source of
  truth and is what the unit tests exercise (the SDK keeps its handler map
  private, so a public in-process entry point is both the testable and the
  programmatically useful surface).
- `createFirewallAdapter` gains a third `options: { root?: string }` argument.
  `scanFile` resolves the requested path against the real-path of the
  configured root (`options.root` → `FBEAST_ROOT` → `cwd`) and refuses any
  target that is not the root or under `root + sep`. `servers/firewall.ts`
  passes `{ root: FBEAST_ROOT ?? cwd }`.

Commits: `acb7265` (schema enforcement), `7085b5c` (path containment).

## Consequences

### Positive
- Every MCP tool inherits input validation centrally (DRY) — no per-handler
  validation drift.
- `fbeast_firewall_scan_file` can no longer be coerced into reading
  `/etc/passwd` or `../`-escaped paths.

### Negative / Residual
- **Validation is structural only.** It does not implement full JSON-Schema:
  no `format`, `enum`, `pattern`, nested-object, or array-item validation.
  Schemas in this codebase are flat `{ type, description }` maps, so this
  matches the advertised contract — but consumers must not assume deep
  JSON-Schema semantics.
- **Unknown properties are rejected (fail closed), not allowed.** This is a
  deliberate security posture for first-party tools, not JSON-Schema
  `additionalProperties` default behavior (the flat `ToolInputSchema` has no
  such field). A tool that legitimately needs extra fields must declare them
  in its own `inputSchema`; the global gate is intentionally strict.
- `realpathSync` throws `ENOENT` for a missing in-root path; the firewall
  server handler already catches and surfaces this as a tool error
  (`isError: true`), which is acceptable behavior.
- Callers passing absolute paths outside the root now get a hard error instead
  of a silent read.

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Reach into SDK private `_requestHandlers` from tests | No API change | Brittle, couples tests to SDK internals | A public `callTool` is both testable and a legitimately useful in-process entry point |
| Full JSON-Schema validator (ajv) | Complete validation | New dependency; schemas here are flat | Structural validation matches the advertised flat schema contract; documented as residual |
| Per-handler argument validation | Localized | Duplicated, drifts, easy to forget | Central gate in `dispatchTool` is DRY and unmissable |
| Containment via string `startsWith` only (no realpath) | Simpler | Symlink escape bypasses it | `realpathSync` closes the symlink-escape hole |
