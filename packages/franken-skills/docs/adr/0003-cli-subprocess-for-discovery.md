# ADR-0003 — CLI Subprocess for Skill Discovery (Not Direct npm Import)

**Status**: Accepted

## Context

`@djm204/agent-skills` is the primary source of global skills. There are two ways to read from it:

**Option A — Direct import**: `import { listSkills } from '@djm204/agent-skills'` and call the function directly. Fast, no subprocess overhead, type-safe if the package exports types.

**Option B — CLI subprocess**: Spawn `npx @djm204/agent-skills --list`, capture stdout, parse JSON.

The choice has significant architectural implications.

## Decision

Use the CLI subprocess approach (Option B). The Discovery Service spawns `npx @djm204/agent-skills --list` and parses its stdout into `RawSkillEntry[]`, then maps to `UnifiedSkillContract[]`.

Rationale:
- **Decoupling**: The registry is not tightly bound to the package's internal module shape. If `@djm204/agent-skills` refactors its exports, the CLI contract (stdout JSON) is the stable surface.
- **Substitutability**: Any future skill source that implements the same CLI protocol can be dropped in without changing the Discovery Service. A direct import couples MOD-02 to one package's API.
- **Boundary isolation**: The CLI is a clean I/O boundary — easy to mock with fixture stdout in tests. A direct import requires mocking internal module functions.
- **Offline detectability**: A subprocess failure (non-zero exit, timeout, malformed stdout) is an explicit, catchable event. A broken import silently corrupts the process.

The `ISkillCli` interface abstracts the subprocess, so tests never actually spawn `npx`. The concrete `AgentSkillsCli` class is the only place subprocess invocation lives.

## Consequences

- Discovery adds startup latency (subprocess spawn + stdout parse). Acceptable for v1; cached after sync.
- `npx` must be available in the runtime environment. This is a known constraint — document it in the README.
- Malformed or empty stdout is a hard failure: the registry does not partially load. A corrupt partial registry is worse than no registry.
- The `ISkillCli` abstraction makes the subprocess boundary trivially testable with fixture data — no `npx` calls in unit tests.
- If `@djm204/agent-skills` changes its `--list` output format, the parser breaks explicitly (parse error), not silently (type coercion).
