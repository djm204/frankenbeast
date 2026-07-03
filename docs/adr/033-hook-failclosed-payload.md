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

1. **Forward command text as the governor context via an env var, not argv.**
   Each pre-tool script extracts only the policy-relevant **command** fields from
   `tool_input` (`command`, `cmd`, `commands`, `args`, `argv`, `script`),
   flattens command-token arrays (`["rm","-rf","/x"]` → `"rm -rf /x"`) so
   whitespace-based patterns like `/rm\s+-rf/` still match, and passes the result
   to `fbeast-hook pre-tool` in the `FBEAST_TOOL_CONTEXT` environment variable.
   `hook.ts` reads it via an injectable `readContext()` dependency. The tool name
   remains a positional but is passed after a `--` end-of-options marker, and the
   arg parser honours `--`. (An env var was chosen over stdin because reading
   stdin synchronously blocks whenever the hook is invoked without a closed stdin
   — e.g. in-process callers and tests — whereas an env var is non-blocking.)
   This is the structural fix for the round-2 findings:
   - **No flag injection.** Untrusted command text never appears on argv, so a
     payload like `--db=/tmp/x; rm -rf /tmp/y` can no longer be consumed by the
     `--db` parser and hidden from the governor.
   - **No truncation / no silent fail-open.** The context is forwarded **whole**;
     we no longer truncate to 4096 chars (which previously could drop a dangerous
     suffix and fail open). If a command ever exceeds the OS env-size limit, the
     `exec` of `fbeast-hook` fails and the non-zero status is treated as a deny
     (fail-closed) — the safe direction.
   - **Arrays normalized.** Command tokens supplied as arrays are flattened
     before matching instead of being serialized as JSON (`["rm","-rf"]`), which
     the whitespace patterns would miss.
   - **Path/content fields excluded.** File paths (`file_path`, `path`, ...) and
     file-content fields (`content`, `old_string`, `new_string`, patch bodies)
     are not forwarded. This prevents (a) false positives where a benign path
     such as `src/dropdown.tsx` or `docs/formatting.md` trips `/drop/i`/`/format/i`,
     and (b) persisting raw file contents (secrets/PII) verbatim into
     `governor_log`. Destructive file operations are still governed via the
     `command` text (e.g. `rm -rf path`) and the tool name (`action`).

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
