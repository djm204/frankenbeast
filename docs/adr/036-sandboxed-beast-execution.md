# ADR-036: Sandboxed Beast Execution

- **Date:** 2026-05-23
- **Status:** Accepted
- **Deciders:** pfk, per security-hardening Chunk 3

## Context

The 2026-04-28 agent-systems audit found three live execution-boundary gaps:

- `ContainerBeastExecutor` existed but only threw `not implemented` for start/stop/kill.
- Process-mode Beast execution inherited almost all of `process.env`, excluding only `CLAUDE*` variables.
- Process-mode `cwd` was passed directly to `spawn`, so caller-controlled configuration could escape the intended project root.

The audit also asked for sandboxing stronger than local host process execution. A full micro-VM/gVisor/Wasm runtime is outside this chunk, but a real container execution path with no Docker network is a concrete improvement over the placeholder.

## Decision

Implement two execution boundaries:

1. **Container mode**
   - Add a shared `SandboxPolicy` and `DEFAULT_BEAST_ENV_ALLOWLIST`.
   - Add `toDockerSpec(spec, policy)` to transform a normal `BeastProcessSpec` into a Docker invocation.
   - Docker runs as `docker run --rm --network none` with one explicit workspace mount and `-w /workspace`.
   - Environment is passed into the container only for keys on the allowlist and only when present in the Beast spec.
   - The Docker client process itself receives `env: {}`.
   - `ContainerBeastExecutor` now delegates lifecycle handling to `ProcessBeastExecutor` through a Docker-transforming supervisor, preserving existing durable run/attempt/log/event behavior.

2. **Process mode**
   - `ProcessSupervisor` now constructs child environment from `DEFAULT_BEAST_ENV_ALLOWLIST` plus explicit `spec.env` only.
   - `ProcessSupervisor` accepts an optional `projectRoot` and rejects `cwd` values outside that root.
   - `createBeastServices` wires `projectRoot` from `FBEAST_ROOT ?? process.cwd()` for both process and container-backed execution.

## Consequences

### Positive

- `container` execution mode is no longer a throwing placeholder.
- Container mode has OS/container-level no-network behavior through Docker `--network none`.
- Container mode uses explicit mount and working-directory mapping instead of raw host cwd execution.
- Host secrets such as `GITHUB_TOKEN` are no longer inherited into Beast child processes by default.
- Process-mode cwd escape is rejected before spawning.
- Both backends share the same environment allowlist contract.

### Negative / Residual

- Docker `--network none` is not a micro-VM, gVisor, Firecracker, Wasm, or seccomp profile. Do not market this as micro-VM isolation.
- Process mode is still a host process. It has env and cwd containment, but no OS-level filesystem, user, syscall, or network isolation.
- Container mode requires Docker to be installed and a suitable image (`fbeast/sandbox:latest` by default) to be available or overridden in policy.
- Workspace filesystem access is limited to the explicit mount from the policy, but that mount is still read/write unless future policy work adds read-only mounts or per-run disposable workspaces.

## Verification

```bash
cd packages/franken-orchestrator
npm test -- --run tests/unit/beasts/execution/docker-container-runtime.test.ts tests/unit/beasts/container-beast-executor.test.ts tests/unit/beasts/execution/process-supervisor.test.ts tests/integration/beasts/beast-routes.test.ts tests/integration/beasts/agent-routes.test.ts
npm run typecheck
```

Targeted result during implementation: 5 test files passed, 38 tests passed; typecheck passed.
