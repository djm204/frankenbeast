# ADR-029: Config File Passthrough for Spawned Agent Processes

- **Date:** 2026-03-16
- **Status:** Accepted
- **Deciders:** pfk

## Context

When the beast daemon spawns an agent subprocess, the agent needs the full configuration from the wizard (LLM targets, module config, git presets, skills, prompt frontloading). Currently only two env vars (`FRANKENBEAST_PROVIDER`, `FRANKENBEAST_CHUNK_DIRECTORY`) reach the subprocess.

The configuration includes:
- Nested objects (LLM overrides per action)
- Arrays (skill selections, file paths)
- Arbitrarily long strings (prompt text)
- Structured presets (git workflow config)

This data doesn't fit cleanly into environment variables.

## Decision

Write the full `run.configSnapshot` to a JSON file and pass its path to the subprocess via a single env var.

**Flow:**

1. `ProcessBeastExecutor.start()` writes config to `.frankenbeast/.build/run-configs/<runId>.json`
2. The executor writes a sibling checksum manifest at `<runId>.json.manifest.json` with schema version, file name, algorithm, digest, and generation timestamp.
3. Launch preflight verifies the runtime config against the manifest before `supervisor.spawn()` is called. Missing manifests, malformed manifests, or digest drift fail closed with operator guidance.
4. Subprocess receives `FRANKENBEAST_RUN_CONFIG=<absolute-path>` only after the preflight passes.
5. CLI's `config-loader.ts` gains a new source at highest priority:
   - `run-config > CLI args > env vars > config file > defaults`
6. Config and manifest files are deleted when run reaches terminal state (completed/failed/stopped)

**Legitimate config updates:** Reviewed runtime-config changes are approved by regenerating the manifest after inspection. For the daemon-managed ephemeral run config, this happens automatically during `ProcessBeastExecutor.start()` immediately after the redacted config snapshot is written and before the preflight check. For emergency operator recovery only, set `FRANKENBEAST_RUN_CONFIG_INTEGRITY_BYPASS=1` or pass the executor bypass option; bypasses are explicit and should be audit-noted by the caller.

**Config file schema matches the existing orchestrator config shape** with wizard-specific extensions (llmConfig, gitConfig, skills, promptConfig). The spawned process logs `"loaded config from <path>"` on startup for debuggability.

## Consequences

### Positive
- Arbitrarily complex config survives serialization cleanly (JSON)
- Matches existing `--config <path>` pattern — no new config loading mechanism
- Spawned process can inspect its own config for debugging
- Single env var instead of dozens
- Config priority chain is explicit and documented

### Negative
- Filesystem write before every spawn (negligible overhead)
- Config file must be cleaned up to avoid stale files (handled in finishAttempt)
- Config is written to disk (contains no secrets — secrets are resolved at runtime via SecretResolver)

### Risks
- If the daemon crashes before cleanup, orphaned config files accumulate (mitigated by `--cleanup` command)
- Config file could be tampered with between write and read (mitigated by `.frankenbeast/` directory permissions plus the pre-launch checksum manifest verification)

## Alternatives Considered

| Option | Pros | Cons | Rejected Because |
|--------|------|------|-----------------|
| Individual env vars per config field | No file I/O | Can't represent nested/array data; env size limits; fragile | Breaks with complex config shapes |
| Pipe config via stdin | No filesystem artifact | Subprocess can't re-read config; complicates stdio | Subprocess already uses stdin for other purposes |
| Shared memory / IPC | Fast, no disk | Platform-specific; complex; subprocess must cooperate | Over-engineered for a config blob passed once at startup |
| Embed config in CLI args | Simple | Command-line length limits; escaping issues with special chars | Prompt text alone could exceed arg length limits |
