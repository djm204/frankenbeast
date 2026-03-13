# franken-orchestrator Ramp-Up

`franken-orchestrator` is no longer just the thin "Beast Loop" package described in older docs. It still contains the core orchestrator primitive, but it now also owns the CLI session flow, chunk planning/execution stack, chat surfaces, a small Beast control plane, managed network tooling, init flows, and GitHub issue automation.

If you are ramping up on this package, start from two files:

- `src/index.ts` for the public library exports
- `src/cli/run.ts` for the actual CLI/product entrypoint

## What This Package Ships Today

1. `BeastLoop`, the core orchestrator pipeline
2. A CLI (`frankenbeast`) for interview -> plan -> execute workflows
3. Chunk-based execution that delegates implementation to external CLIs (`claude`, `codex`, `gemini`, `aider`)
4. Chat surfaces:
   - interactive terminal chat (`frankenbeast chat`)
   - local HTTP + WebSocket chat server (`frankenbeast chat-server`)
5. Beast run management backed by SQLite + log files
6. Network service management for local Frankenbeast services
7. `init` flows for generating/verifying `.frankenbeast/config.json`
8. GitHub issues triage/review/execution automation

## Current Top-Level Layout

```text
src/
  beast-loop.ts              Core orchestrator primitive
  index.ts                   Public library barrel
  cli/                       Main CLI entrypoint, session flow, dep factory
  phases/                    Ingestion, hydration, planning, execution, closure
  planning/                  Chunk decomposition, validation, remediation, graph builders
  skills/                    CLI execution stack, provider registry, git isolation
  session/                   Chunk session persistence, compaction, snapshots, GC
  chat/                      Conversation engine, turn runner, transcript/session logic
  http/                      Hono app, REST routes, WebSocket chat server
  beasts/                    Beast definitions, repository, services, executors, metrics
  network/                   Service registry, supervisor, logs, state, secret handling
  init/                      Guided setup + verification for operator config
  issues/                    GitHub issue fetch/triage/review/run pipeline
  adapters/                  Bridges from CLI providers to internal interfaces
  config/                    Zod config schema
  breakers/                  Injection, budget, critique-spiral breakers
  checkpoint/                File checkpoint persistence
  resilience/                Context serialization, shutdown, module health
  closure/                   PR creation
  context/                   Mutable orchestrator context
  logging/                   CLI/log rendering helpers
```

The test suite is broad and split across:

- `tests/unit`, `tests/integration`, `tests/e2e`
- legacy-but-still-used `test/` coverage for some CLI/logging/skills cases

## The Real Architectural Split

There are three layers in this package:

### 1. Core orchestration primitive

`BeastLoop` in `src/beast-loop.ts` is still the lowest-level orchestrator. It wires dependency ports from `src/deps.ts` and runs:

1. ingestion
2. hydration
3. planning
4. execution
5. closure

Important detail: hydration exists as a real phase implementation, but `BeastPhase` in `src/types.ts` only tracks `ingestion | planning | execution | closure`. Hydration happens between ingestion and planning and mutates `ctx.sanitizedIntent.context`; it is not represented as a standalone external phase value.

### 2. Product/CLI orchestration

`src/cli/run.ts` is the real operator-facing entrypoint. It parses subcommands, loads config, scaffolds `.frankenbeast/`, and then routes into one of several product surfaces:

- `init`
- `interview`
- `plan`
- `run`
- `issues`
- `chat`
- `chat-server`
- `network`
- `beasts`

When you run `frankenbeast` with no subcommand, it uses `Session` (`src/cli/session.ts`) to drive an interview -> plan -> execute pipeline.

### 3. Execution infrastructure around external agent CLIs

The package’s most opinionated logic is now in the chunk execution stack:

- `LlmGraphBuilder` turns a design doc into chunks
- `ChunkFileWriter` writes chunk markdown files
- `ChunkFileGraphBuilder` converts chunk files into `impl:*` and `harden:*` tasks
- `CliSkillExecutor` delegates work to external provider CLIs
- `MartinLoop` manages iteration, fallback providers, streaming output, and promise-tag completion
- `GitBranchIsolator` handles per-chunk branch isolation and merge flow
- `FileCheckpointStore` and `session/*` persist progress and recovery state

## Core Library Surface

`src/index.ts` currently exports far more than the original loop:

- `BeastLoop` and its phase helpers
- dependency types from `src/deps.ts`
- config and context helpers
- planning builders (`ChunkFileGraphBuilder`, `LlmGraphBuilder`, `InterviewLoop`)
- CLI execution primitives (`CliSkillExecutor`, `MartinLoop`, `GitBranchIsolator`)
- provider registry types/helpers
- checkpoint store
- Beast repository/services/metrics types
- resilience helpers
- `Session` and design-doc file helpers

Not everything used by the CLI is exported. Chat, HTTP, and network internals are mostly package-internal even though they are first-class product features.

## BeastLoop Deep Dive

`BeastLoop.run(input)` is still straightforward:

1. Create `BeastContext`
2. Optionally start tracing
3. Run ingestion
4. Run hydration
5. Run planning
6. Run execution
7. Run closure
8. Convert thrown errors into `BeastResult`

Important current behavior:

- If `deps.graphBuilder` is provided, planning bypasses the planner/critique loop and directly builds a plan from the graph builder.
- Execution supports checkpoint-based task skipping and dirty-file recovery through `CliSkillExecutor`.
- Closure can create a PR via `PrCreator` if configured and all tasks succeeded.
- In CLI mode, `createCliDeps()` provides stub firewall/memory/planner/critique/governor/heartbeat implementations and relies on graph builders + CLI execution instead of fully wired Frankenbeast modules.

## CLI Session Flow

`Session` in `src/cli/session.ts` is the main non-chat workflow wrapper.

### Interview phase

- Uses `InterviewLoop`
- Runs the planning LLM from `tmpdir()` intentionally, to avoid project-scoped plugins contaminating decomposition/interview prompts
- Captures a design doc and writes it into `.frankenbeast/plans/<plan>/design.md`
- Offers continue/revise/exit review flow

### Plan phase

- Reads the stored or provided design doc
- Uses `PlanContextGatherer` to inspect local code context
- Uses `LlmGraphBuilder` to decompose work into validated chunks
- Writes chunk files with `ChunkFileWriter`
- Runs a human review loop over the written chunk files

### Execute phase

- Creates `BeastLoop` with CLI deps
- Uses `ChunkFileGraphBuilder` against the plan directory
- Executes chunk tasks via `CliSkillExecutor`

### Issues flow

`frankenbeast issues` does not use the normal `Session.start()` path. It goes through `Session.runIssues()`:

- fetch issues via `gh issue list`
- triage with an LLM
- human review/approval
- generate chunk plans per approved issue
- execute them through the same BeastLoop + CLI skill stack

## Chunk Planning Model

There are two main graph builders:

### `ChunkFileGraphBuilder`

- Reads numbered `NN_*.md` files from a directory
- Produces an `impl:<chunk>` task and a `harden:<chunk>` task for each chunk
- Orders chunks linearly by filename
- Uses `cli:<chunk>` as the required skill id

### `LlmGraphBuilder`

- Decomposes a design doc into chunk definitions
- Optionally validates and remediates the chunks
- Preserves chunk dependency structure
- Converts dependencies into `impl -> harden` DAG edges

The chunk prompt contract is important:

- `impl` prompts instruct the provider to use TDD and emit a specific `<promise>...</promise>` tag
- `harden` prompts re-verify and fix remaining failures without doing review-style work

## Skill Execution Stack

The execution stack is built around CLI providers rather than in-process tools.

### Providers

The default provider registry currently includes:

- Claude
- Codex
- Gemini
- Aider

### `MartinLoop`

Responsibilities:

- spawn provider CLI commands
- stream readable output
- suppress noisy tool-result dumps
- detect completion via `<promise>` tags
- parse rate-limit reset times from stdout/stderr
- cascade across fallback providers
- resume from compacted chunk session state when needed

### `CliSkillExecutor`

Responsibilities:

- isolate work in git branches
- run Martin iterations
- checkpoint commit hashes
- recover dirty files after interrupted runs
- compact large chunk transcripts
- optionally generate conventional commit messages via `PrCreator`

### Chunk session persistence

`src/session/` stores provider-facing execution history per chunk/task:

- live chunk session JSON
- chunk session snapshots
- compaction summaries
- garbage collection for stale session artifacts

This is separate from the coarse `FileCheckpointStore`, which only tracks completion keys and commit hashes.

## Chat Surfaces

There are two chat products here:

### `frankenbeast chat`

- terminal REPL
- file-backed session persistence
- uses `ConversationEngine` for intent classification and prompt building
- uses `TurnRunner` / `ChatAgentExecutor` for execution-style turns
- can attach to a managed chat service when network state indicates one is already running

### `frankenbeast chat-server`

- local HTTP server + WebSocket server
- built with Hono + Node HTTP
- serves chat routes by default
- can also expose beast-control and network-control routes when dependencies are available

Important detail: Beast control routes on the chat server are only enabled when an operator token can be resolved.

## Beast Subsystem

The `beasts/` tree is effectively a small run-control plane:

- `SQLiteBeastRepository` persists runs/attempts/interviews
- `BeastLogStore` stores run logs
- `BeastCatalogService` exposes fixed definitions from `beasts/definitions/catalog.ts`
- `BeastDispatchService` and `BeastRunService` create/start/stop/restart runs
- `ProcessBeastExecutor` is the real executor today
- `ContainerBeastExecutor` exists as a surface but is not the primary path
- `PrometheusBeastMetrics` records run metrics

Current built-in Beast definitions:

- `design-interview`
- `chunk-plan`
- `martin-loop`

## Network Subsystem

The network layer manages local Frankenbeast-serving services from config.

### Config-driven service registry

`resolveNetworkServices()` builds the active service set from config. Current service definitions are:

- `chat-server`
- `dashboard-web`
- `comms-gateway`
- `compose-infra`

Current defaults from schema:

- `chat.enabled = true`
- `dashboard.enabled = true`
- `comms.enabled = false`
- `compose-infra` is hard-disabled by code

Service dependencies:

- `dashboard-web` depends on `chat-server`
- `comms-gateway` depends on `chat-server`

### Secrets and operator mode

The network config includes:

- `network.mode`
- `network.secureBackend`
- `network.operatorTokenRef`

Supported secure backends:

- `1password`
- `bitwarden`
- `os-keychain`
- `local-encrypted`

## `.frankenbeast/` Filesystem Contract

`getProjectPaths()` in `src/cli/project-root.ts` defines the package’s on-disk working layout:

```text
.frankenbeast/
  config.json
  plans/
    <plan-name>/
      design.md
      llm-response.json
      *.md              chunk files
  .build/
    *.checkpoint
    *-build.log
    build-traces.db
    beasts.db
    beasts/logs/
    chunk-sessions/
    chunk-session-snapshots/
    issues/
  network/
    state.json
    logs/
```

This layout matters because most CLI commands assume it exists and `scaffoldFrankenbeast()` creates key directories eagerly.

## Config Model

`OrchestratorConfigSchema` combines base orchestrator settings with network/chat/dashboard/comms config.

Important current config behavior:

- defaults come from Zod schema parsing
- file config is loaded from `.frankenbeast/config.json` when `--config` is provided
- env support is limited to a small set of core `FRANKEN_*` keys (`MAX_TOTAL_TOKENS`, `MAX_DURATION_MS`, `MAX_CRITIQUE_ITERATIONS`, `ENABLE_HEARTBEAT`, `ENABLE_TRACING`, `MIN_CRITIQUE_SCORE`)
- CLI currently only forces `enableTracing=true` when `--verbose` is set
- `--set` assignments are applied through `applyNetworkConfigSets()`

## Build, Test, and Runtime Requirements

```sh
npm run build
npm test
npm run test:integration
npm run test:e2e
npm run typecheck
```

Runtime notes:

- Node `>=22`
- package dependencies include `better-sqlite3`, `dotenv`, `hono`, `zod`
- many higher-level workflows assume external tools exist, especially provider CLIs and `gh`

## High-Value Files To Read First

If you only read a handful of files, use this order:

1. `src/index.ts`
2. `src/cli/run.ts`
3. `src/cli/session.ts`
4. `src/cli/dep-factory.ts`
5. `src/beast-loop.ts`
6. `src/planning/llm-graph-builder.ts`
7. `src/skills/cli-skill-executor.ts`
8. `src/skills/martin-loop.ts`
9. `src/http/chat-server.ts`
10. `src/beasts/create-beast-services.ts`

## Current Gotchas and Mismatches Worth Knowing

- The package is broader than the old "8-module orchestrator" description. Treat it as a product package, not just a loop library.
- `--resume` is parsed by CLI args but is not currently consumed by the main CLI session flow. Real rerun behavior comes from existing checkpoint/session artifacts plus `runExecution()` recovery logic.
- `network config --set ...` is applied to the in-memory config used for that invocation, but the CLI network command path does not currently persist the updated config back to disk. Persistent network config writes happen through the HTTP network routes, not the `runNetworkCommand()` CLI handler.
- In CLI mode, the orchestrator does not wire concrete firewall/memory/planner modules; it uses stub ports plus graph builders and CLI skills.
- `compose-infra` exists in the service registry but is disabled by `enabled: () => false`.
- Chat/beast/network features share this package, but not all of those internals are exported from `src/index.ts`.
- The package uses both `tests/` and `test/` trees; do not assume one is dead without checking references and scripts.
