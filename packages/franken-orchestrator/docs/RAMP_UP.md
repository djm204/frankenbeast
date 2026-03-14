# franken-orchestrator Ramp-Up

`franken-orchestrator` is no longer just the eight-module `BeastLoop`. It is the product package that owns:

- the core orchestration pipeline
- the CLI/session workflow for interview, plan, run, and issues
- CLI-backed provider integration
- request-serving surfaces like chat-server and the managed network
- Beast run management
- local init flows
- persistent LLM caching for repeated work

## Architecture Layers

### 1. Core orchestration

The core `BeastLoop` still lives under `src/beast-loop.ts` and `src/phases/*`.

- `src/context/*`
  Builds and mutates `BeastContext`
- `src/phases/*`
  Ingestion, hydration, planning, execution, closure
- `src/breakers/*`
  Injection, budget, and critique-spiral circuit breakers
- `src/deps.ts`
  Port interfaces and `BeastLoopDeps`

### 2. Work execution and CLI product surface

The CLI/session layer is where most real package behavior now lives.

- `src/cli/run.ts`
  Main CLI entrypoint
- `src/cli/session.ts`
  Interview, planning, execution, and issues session flow
- `src/cli/dep-factory.ts`
  Runtime wiring for providers, observers, skills, issue pipeline, PR creation, and chunk-session stores
- `src/planning/*`
  Design-doc decomposition, validation, remediation, chunk-file writing
- `src/issues/*`
  GitHub issue fetch, triage, review, graph building, execution orchestration
- `src/skills/*`
  CLI skill execution, Martin loop, git isolation, provider registry
- `src/session/*`
  Chunk-session persistence, compaction, rendering, GC

### 3. Serving, Beast, and local platform features

- `src/chat/*`
  Conversation engine and chat runtime
- `src/http/*`
  Chat server and HTTP routes
- `src/network/*`
  Managed local service lifecycle and secrets integration
- `src/beasts/*`
  Beast catalog, run persistence, agent init, durable run services
- `src/init/*`
  Repo bootstrap/init flows

## Provider and LLM Stack

The package is CLI-provider driven.

- `src/skills/providers/*.ts`
  Provider-specific CLI adapters and cache capability metadata
- `src/adapters/cli-llm-adapter.ts`
  Normalizes prompt execution through Claude, Codex, Gemini, or Aider CLIs
- `src/adapters/adapter-llm-client.ts`
  Simple `ILlmClient` wrapper for adapter-backed completion

The provider capability model is explicit now. Providers advertise whether they support:

- native work-session continuation
- persistent reuse across processes
- managed-cache fallback only

## Intelligent Cache Model

LLM caching now lives under `src/cache/*`.

- `src/cache/cached-cli-llm-client.ts`
  Cache-aware `ILlmClient` for CLI-backed providers
- `src/cache/cached-llm-client.ts`
  Applies exact-response reuse and native-session fallback logic
- `src/cache/llm-cache-store.ts`
  Disk-backed cache entries
- `src/cache/provider-session-store.ts`
  Disk-backed provider session metadata
- `src/cache/llm-cache-policy.ts`
  Stable/work/volatile prompt partitioning

Cache root:

```text
.frankenbeast/.cache/llm
```

Scope rules:

- project-stable material can persist across runs in the same repo
- work-local state is isolated by work id
- unrelated issues do not share provider-session state or dynamic prompt history

Wired today:

- plan decomposition
- issue triage
- issue chunk decomposition
- PR description generation
- commit message generation
- chunk-session compaction

Not wired yet:

- chat and chat-server persistent work-session reuse

Reason:

The current chat/runtime path does not yet propagate a safe conversation work id through `ILlmClient.complete(prompt)`.

## `.frankenbeast/` Filesystem Contract

Important locations:

```text
.frankenbeast/
  config.json
  plans/
    <plan>/
      design.md
      llm-response.json        # legacy path; no longer the primary cache
  .cache/
    llm/
  .build/
    *.checkpoint
    build-traces.db
    memory.db
    beasts.db
    beasts/
    issues/
    chunk-sessions/
    chunk-session-snapshots/
  chat/
```

`ProjectPaths` is defined in `src/cli/project-root.ts`.

## Most Important Files To Read First

Read in this order if you need fast orientation:

1. `src/cli/run.ts`
2. `src/cli/session.ts`
3. `src/cli/dep-factory.ts`
4. `src/beast-loop.ts`
5. `src/phases/execution.ts`
6. `src/planning/llm-graph-builder.ts`
7. `src/issues/issue-runner.ts`
8. `src/skills/cli-skill-executor.ts`
9. `src/skills/martin-loop.ts`
10. `src/cache/cached-cli-llm-client.ts`

## Current Behavioral Notes

- `--resume` is still not a full CLI session resume path; actual recovery comes from checkpoints and chunk-session persistence.
- `ProjectPaths.llmResponseFile` still exists, but intelligent caching now lives in `.frankenbeast/.cache/llm`.
- CLI mode still uses stubbed module ports for parts of the original eight-module loop and relies on graph builders plus CLI skill execution for most real work.
- `compose-infra` exists in the network registry model but remains hard-disabled.
- Both `tests/` and `test/` are active in this package; do not assume one canonical test root.

## Build and Verification

```sh
npm run build
npm run typecheck
npm test
```

## Dependencies That Matter

- `@franken/types`
  Shared `ILlmClient`, spend types, and core interfaces
- `@franken/skills`
  Local/project skill registry
- `@franken/firewall`
  Optional firewall module wiring
- `franken-brain`
  Optional memory store wiring
- `better-sqlite3`
  Local persistence for memory and Beast services
- `hono`
  HTTP/chat server routes
