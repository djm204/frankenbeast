# ADR-033: Hook governance fails closed and forwards tool payloads

- Status: Accepted
- Date: 2026-06-28
- Related issues: #362 (ARCH-004), #347, #363 (ARCH-005)
- Supersedes/refines: generated hook behaviour in `packages/franken-mcp-suite/src/cli/hook-scripts.ts`

## Context

The generated pre-tool hook scripts (Claude Code, Codex CLI, Gemini CLI) are the
only automatic enforcement path between an agent and the fbeast governor. Two
architectural defects made that path unsafe:

1. **Payload dropping (ARCH-004 / #347).** Each pre-tool script extracted only
   `tool_name` and invoked `fbeast-hook pre-tool --db "$DB" "$TOOL_NAME"`. The
   governor (`adapters/governor-adapter.ts`) matches dangerous patterns
   (`rm -rf`, `force push`, `reset --hard`, ...) against `"${action} ${context}"`,
   but `context` was always empty because `hook.ts` defaults the payload arg to
   `''`. A call with a benign tool name (`Bash`) and a destructive payload
   (`rm -rf important-dir`) was judged on the name alone and allowed.

2. **Fail-open policy (ARCH-005 / #363).** The scripts exited `0` (allow) when
   the tool name was empty/unparseable and when governance timed out
   (status `124`). If JSON parsing failed, the binary was slow/cold, or SQLite
   was locked, dangerous operations proceeded unchecked.

## Decision

For the security-critical pre-tool enforcement path:

1. **Forward the tool payload.** Each pre-tool script now also extracts
   `tool_input` (JSON-serialized, all three clients use this field) and passes it
   as the third positional argument to `fbeast-hook pre-tool`, where it becomes
   the governor's `context`. The destructive command text is now evaluated.

2. **Fail closed by default.** A missing/unparseable tool name now DENIES instead
   of allowing. Timeout status `124` is no longer special-cased to exit `0`; it
   falls through the generic "any non-zero status denies" path alongside
   internal-timeout failures (`125`/`126`), kills (`137`), and missing-binary
   (`127`). Fail-open is no longer the default for the enforcement path.

Each client keeps its native deny convention:

| Client | Deny output | Exit |
|--------|-------------|------|
| Claude Code | reason on **stderr** (`fbeast governor blocked: ...`) | `2` |
| Codex CLI | stdout JSON `{"hookSpecificOutput":{...,"permissionDecision":"deny",...}}` | `2` |
| Gemini CLI | stdout JSON `{"decision":"deny","reason":...}` | `2` |

The post-tool (observer) hooks remain fail-open: they are observability only and
must never block a completed tool call.

## Consequences

- Destructive payloads behind benign tool names are now evaluated and blocked.
- If `fbeast-hook` is unavailable, slow, or the input is malformed, tool calls are
  denied rather than silently permitted. Operators who need to bypass governance
  use the existing `FBEAST_DISABLE_HOOKS=1` / `FRANKENBEAST_SPAWNED=1` escape
  hatches, which short-circuit before any governance runs.
- Tests in `hook-scripts.test.ts` were extended to assert payload pass-through and
  fail-closed behaviour for empty tool names and timeouts across all three clients.
