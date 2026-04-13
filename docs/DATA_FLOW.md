# Frankenbeast Data Flow

This document maps how data moves through Frankenbeast today and how it is intended to move in the target architecture.

Two rules for reading this document:

- **Current** means the code-backed behavior in this repository as of `origin/main` at `b835f52` on 2026-03-13.
- **Target** means the accepted or proposed end-state described by the ADRs and architecture docs, even where the local CLI path is not fully wired yet.

## Scope

This document covers:

- CLI entry and Beast Loop execution
- chunk planning and MartinLoop chunk execution
- dashboard chat and websocket streaming
- tracked-agent and Beast run control flows
- issue execution
- network operator control flows
- persistent stores and long-lived artifacts
- target full-module orchestration, external comms, and observability flows

## Key Data Objects

| Object | Meaning | Current producers | Current consumers |
|---|---|---|---|
| `sanitizedIntent` | normalized goal/strategy/context derived from raw input | Firewall pipeline or stub firewall | planning phase |
| `PlanGraph` | ordered task graph for execution | `ChunkFileGraphBuilder`, `LlmGraphBuilder`, `IssueGraphBuilder` | execution phase |
| `PlanTask` | one executable task in the graph | graph builders | `runExecution()` |
| `SkillInput` | objective + context + dependency outputs for a task | execution phase | `CliSkillExecutor` or skills module |
| `ChunkSession` | canonical per-chunk execution transcript and metadata | `MartinLoop` | renderer, compactor, recovery logic |
| `ChatSession` | persisted dashboard/chat session state | chat routes and websocket controller | dashboard UI, chat runtime |
| `TrackedAgent` | durable lifecycle record above a Beast run | agent routes, chat init flow | dashboard UI, dispatch service |
| `BeastRun` | execution record for a launched beast | dispatch service | run service, dashboard UI |
| `Trace` / spans | observer telemetry, token spend, costs | `CliObserverBridge` and observer package | closure, trace viewer, observer adapters |

## Current Data Flows

### Current Runtime Surface Map

```mermaid
flowchart TD
    User["Operator / developer"]
    CLI["frankenbeast CLI"]
    Dashboard["franken-web dashboard"]
    ChatServer["Hono chat server"]
    BeastApi["Beast + agent routes"]
    NetworkApi["network routes"]
    Issues["issues pipeline"]
    BeastLoop["BeastLoop"]
    ProcessExec["ProcessBeastExecutor"]
    Subprocess["Managed beast subprocess"]

    ChatStore[(".fbeast/chat/*.json")]
    BeastDb[(".fbeast/.build/beasts.db")]
    BeastLogs[(".fbeast/.build/beasts/logs")]
    BuildArtifacts[(".fbeast/.build/*")]

    User --> CLI
    User --> Dashboard

    Dashboard -->|HTTP + WebSocket| ChatServer
    Dashboard -->|HTTP| BeastApi
    Dashboard -->|HTTP| NetworkApi

    CLI -->|interactive / plan / run| BeastLoop
    CLI -->|issues| Issues
    CLI -->|chat-server| ChatServer
    CLI -->|network| NetworkApi

    ChatServer --> ChatStore
    ChatServer --> BeastApi
    ChatServer --> NetworkApi

    BeastApi --> BeastDb
    BeastApi --> BeastLogs
    BeastApi --> ProcessExec
    ProcessExec --> Subprocess
    Subprocess --> BuildArtifacts

    Issues --> BeastLoop
    BeastLoop --> BuildArtifacts
```

### Current Beast Loop in the Local CLI Path

The current local Beast Loop is no longer fully stubbed. `createCliDeps()` now attempts real wiring for `firewall`, `skills`, and `memory`, while `planner`, `critique`, `governor`, and `heartbeat` still fall back to stubs in the local dep factory.

That means the current path is:

- real ingestion sanitization when `@franken/firewall` is available and enabled
- real local skill discovery and skill execution adapter wiring when `@franken/skills` is available and enabled
- real episodic memory persistence through `franken-brain` when enabled
- graph-builder-driven planning for chunk files or design-doc decomposition
- real CLI task execution, chunk sessions, observer telemetry, checkpoints, PR creation
- stub planner/critique/governor/heartbeat unless a different integration path is added

```mermaid
flowchart LR
    Input["CLI input / design doc / chunk dir / issue prompt"]
    Ingest["Phase 1: Ingestion"]
    Hydrate["Phase 1b: Hydration"]
    Plan["Phase 2: Planning"]
    Execute["Phase 3: Execution"]
    Close["Phase 4: Closure"]
    Result["BeastResult"]

    FW["FirewallPortAdapter or stub"]
    MEM["EpisodicMemoryPortAdapter or stub"]
    GB["GraphBuilder when present"]
    Planner["Planner module stub"]
    Critique["Critique module stub"]
    Skills["SkillsPortAdapter or stub skill list"]
    Governor["Governor stub"]
    Observer["CliObserverBridge"]
    Heartbeat["Heartbeat stub"]
    PR["PrCreator"]

    Input --> Ingest --> Hydrate --> Plan --> Execute --> Close --> Result
    FW --> Ingest
    MEM --> Hydrate
    GB --> Plan
    Planner --> Plan
    Critique --> Plan
    Skills --> Execute
    Governor --> Execute
    Observer --> Execute
    Observer --> Close
    Heartbeat --> Close
    PR --> Close
```

#### Current planning decision path

```mermaid
flowchart TD
    Start["runPlanning()"]
    GraphBuilder{"graphBuilder provided?"}
    GB["graphBuilder.build(intent)"]
    Planner["planner.createPlan(intent)"]
    Critique["critique.reviewPlan(plan)"]
    Approved{"pass + min score?"}
    Spiral["CritiqueSpiralError"]
    PlanReady["ctx.plan ready"]

    Start --> GraphBuilder
    GraphBuilder -->|yes| GB --> PlanReady
    GraphBuilder -->|no| Planner --> Critique --> Approved
    Approved -->|yes| PlanReady
    Approved -->|no, max iterations hit| Spiral
    Approved -->|no, retry allowed| Planner
```

Today, most useful local execution paths avoid the planner stub by supplying a `GraphBuilder`:

- chunk directory -> `ChunkFileGraphBuilder`
- design doc -> `LlmGraphBuilder`
- issue chunk decomposition -> chunk files + `ChunkFileGraphBuilder`

### Current Chunk File and MartinLoop Execution Flow

The current executable unit is still the chunk pair:

- `impl:<chunkId>`
- `harden:<chunkId>`

Both are driven through CLI-backed skills and the canonical chunk-session state.

```mermaid
sequenceDiagram
    participant BL as BeastLoop
    participant EX as runExecution()
    participant CKP as FileCheckpointStore
    participant CSE as CliSkillExecutor
    participant GIT as GitBranchIsolator
    participant ML as MartinLoop
    participant CSS as ChunkSessionStore
    participant SNAP as SnapshotStore
    participant COMP as ChunkSessionCompactor
    participant CLI as Provider CLI
    participant OBS as CliObserverBridge

    BL->>EX: execute ctx.plan.tasks
    loop each ready task
        EX->>CKP: has(taskId:done)?
        alt already checkpointed
            CKP-->>EX: yes
            EX-->>BL: skip task
        else not checkpointed
            EX->>CSE: execute(skillId, SkillInput)
            CSE->>GIT: isolate(chunk/task branch)
            CSE->>ML: run(prompt, promiseTag)
            ML->>CSS: load/create canonical chunk session
            ML->>CLI: spawn provider subprocess
            CLI-->>ML: streamed output
            ML->>OBS: record tokens, cost, spans, budget checks
            alt context >= threshold
                ML->>SNAP: write pre-compaction snapshot
                ML->>COMP: summarize older transcript
                COMP-->>CSS: compacted session state
            end
            ML-->>CSE: success or failure
            CSE->>GIT: merge back to base
            EX->>CKP: write taskId:done
        end
    end
```

### Current Module Toggle Flow into Beast Subprocesses

One major current-state change is that module enablement can now be attached to tracked agents and Beast runs, then injected into the actual subprocess environment.

```mermaid
flowchart LR
    Dashboard["dashboard or API request"]
    Agent["TrackedAgent.moduleConfig"]
    Dispatch["BeastDispatchService.createRun()"]
    Run["BeastRun.configSnapshot.modules"]
    Exec["ProcessBeastExecutor"]
    Env["FRANKENBEAST_MODULE_* env vars"]
    Deps["createCliDeps() module resolution"]
    Modules["real adapter or stub per module"]

    Dashboard --> Agent --> Dispatch --> Run --> Exec --> Env --> Deps --> Modules
```

Resolution order in `createCliDeps()` is:

1. explicit `enabledModules` passed into the process
2. `FRANKENBEAST_MODULE_*` environment variables
3. default enabled

### Current Dashboard Chat Flow

The dashboard chat path is a combined HTTP bootstrap plus websocket streaming flow. Session state is persisted on disk as JSON under `.fbeast/chat/`.

```mermaid
sequenceDiagram
    participant UI as franken-web
    participant HTTP as chat routes
    participant Store as FileSessionStore
    participant WS as ChatSocketController
    participant Runtime as ChatRuntime
    participant Engine as ConversationEngine / TurnRunner

    UI->>HTTP: createSession(projectId) or getSession(sessionId)
    HTTP->>Store: create/get/save ChatSession
    Store-->>HTTP: ChatSession + socket token
    HTTP-->>UI: session snapshot

    UI->>WS: connect /v1/chat/ws?sessionId=...&token=...
    WS->>Store: get(sessionId)
    WS-->>UI: session.ready

    UI->>WS: message.send
    WS->>Runtime: run(content, session state)
    Runtime->>Engine: process turn or slash command
    Engine-->>Runtime: display messages + events + approval state
    Runtime-->>WS: result
    WS->>Store: save updated ChatSession
    WS-->>UI: execution events, approval events, assistant deltas, assistant complete
```

Current chat branching inside `ChatRuntime`:

- slash commands like `/plan` and `/run` go straight to `TurnRunner`
- freeform conversational prompts go through `ConversationEngine`
- beast-launch phrases can be intercepted first by `ChatBeastDispatchAdapter`

### Current Tracked-Agent and Beast Run Flow

Tracked agents are the current control-plane record for dashboard and chat-backed beast launches. Beast runs remain the execution record.

```mermaid
flowchart TD
    Launch["dashboard launch or chat beast-init intent"]
    AgentRoute["POST /v1/beasts/agents"]
    AgentSvc["AgentService"]
    AgentDb[("beasts.db: tracked_agents + tracked_agent_events")]
    Dispatch["BeastDispatchService"]
    RunDb[("beasts.db: beast_runs + attempts + events")]
    Proc["ProcessBeastExecutor"]
    Child["spawned beast process"]
    Logs[("beasts/logs/<run>/<attempt>.log")]

    Launch --> AgentRoute --> AgentSvc --> AgentDb
    AgentRoute --> Dispatch
    Dispatch --> RunDb
    Dispatch --> Proc --> Child
    Proc --> Logs
    RunDb --> AgentDb
```

Key current behavior:

- tracked-agent creation records init metadata, source, chat linkage, and optional `moduleConfig`
- dispatch creates a `BeastRun` and links its `run.id` back to the tracked agent
- process execution spawns a separate beast subprocess
- run status changes are synchronized back into tracked-agent status
- logs are persisted separately from the SQLite state

### Current Chat-Backed Beast Launch Flow

When the chat surface detects a beast-launch intent, it can create a tracked agent before execution starts.

```mermaid
flowchart LR
    User["chat message"]
    Adapter["ChatBeastDispatchAdapter"]
    Interview["BeastInterviewService"]
    Init["AgentInitService"]
    Agent["TrackedAgent"]
    Dispatch["BeastDispatchService"]
    Run["BeastRun"]

    User --> Adapter
    Adapter -->|match beast intent| Interview
    Adapter --> Init --> Agent
    User -->|answer prompts| Interview
    Interview -->|config complete| Dispatch --> Run
```

This is how current chat-backed init flows keep durable state before a run exists.

### Current Issue Execution Flow

Issue execution now standardizes around `BeastLoop` through a single chunk-file path.

The current implementation:

- triages the issue
- builds real chunk markdown for the issue
- writes those chunks into an issue-scoped plan directory
- rebuilds a `PlanGraph` from those chunk files
- runs the normal Beast Loop with issue-specific checkpoint, logging, and PR wiring

`one-shot` versus `chunked` complexity currently changes execution limits and decomposition shape, not the fact that real chunk files are written first.

```mermaid
flowchart TD
    CLI["frankenbeast issues"]
    Fetch["IssueFetcher"]
    Triage["IssueTriage"]
    Review["IssueReview"]
    Build["IssueGraphBuilder"]
    Write["ChunkFileWriter -> .fbeast/plans/issue-N/"]
    Graph["ChunkFileGraphBuilder"]
    Loop["BeastLoop"]
    Runtime[(".fbeast/.build/issues/issue-N/*")]
    PR["PrCreator with issueNumber"]

    CLI --> Fetch --> Triage --> Review
    Review -->|approved| Build --> Write --> Graph --> Loop
    Loop --> Runtime
    Loop --> PR
```

Issue-specific state fans out into:

- issue plan directory under `.fbeast/plans/issue-<n>/`
- issue checkpoint file under `.fbeast/.build/issues/issue-<n>/`
- issue build log under `.fbeast/.build/issues/issue-<n>/`
- normal chunk sessions and snapshots under the shared chunk-session roots

### Current Network Operator Flow

The network operator is the current local process control plane for chat server and dashboard-web, with room for comms to join the same model.

```mermaid
flowchart LR
    UI["dashboard network page or frankenbeast network"]
    Routes["/v1/network/* or CLI network command"]
    Config["config.json"]
    Registry["resolveNetworkServices()"]
    Supervisor["NetworkSupervisor"]
    State[(".fbeast/network/state.json")]
    Logs[(".fbeast/network/logs/*")]
    Services["chat-server / dashboard-web / future comms"]

    UI --> Routes
    Routes --> Config
    Routes --> Registry --> Supervisor
    Supervisor --> Services
    Supervisor --> State
    Supervisor --> Logs
```

## Current Persistent Stores and Artifact Flows

```mermaid
flowchart TD
    subgraph Root["project/.fbeast"]
        Config["config.json"]
        Chat["chat/*.json"]
        Plans["plans/<plan>/..."]

        subgraph Build[".build/"]
            BeastDb["beasts.db"]
            BeastLogs["beasts/logs/<run>/<attempt>.log"]
            Traces["build-traces.db"]
            Memory["memory.db"]
            Checkpoints["<plan>.checkpoint and issues/*/*.checkpoint"]
            Session["chunk-sessions/<plan>/<chunk>.json"]
            Snapshots["chunk-session-snapshots/<plan>/<chunk>/*.json"]
            BuildLogs["<plan>-<timestamp>-build.log"]
            IssueArtifacts["issues/issue-<n>/*"]
        end
    end
```

### Store-by-store notes

| Store | Primary writers | Primary readers | What flows through it |
|---|---|---|---|
| `.fbeast/chat/*.json` | chat routes, websocket controller | dashboard chat UI, chat runtime | transcript, beastContext, approval state, token totals |
| `.fbeast/.build/beasts.db` | agent, dispatch, run, interview services | dashboard Beast pages, process executor | tracked agents, runs, attempts, events, interview sessions |
| `.fbeast/.build/beasts/logs/*` | process executor, run service | dashboard logs panel | per-attempt structured log lines |
| `.fbeast/.build/build-traces.db` | observer bridge / trace viewer | trace viewer | spans, token usage, cost telemetry |
| `.fbeast/.build/memory.db` | episodic memory adapter | hydration and trace recording | episodic execution memory |
| `.fbeast/.build/*.checkpoint` | execution phase, issue runner | resume logic | task completion markers and recovery checkpoints |
| `.fbeast/.build/chunk-sessions/*` | MartinLoop | MartinLoop, renderer, compactor | canonical chunk conversation state |
| `.fbeast/.build/chunk-session-snapshots/*` | MartinLoop | recovery and rollback | pre-compaction rollback points |
| `.fbeast/plans/*` | design-doc decomposition, issue writer, operator flows | graph builders, humans | design docs, chunk markdown, cached LLM outputs |

## Target Data Flows

### Target End-to-End System Map

```mermaid
flowchart TD
    User["Human operator / external user"]
    Dashboard["franken-web"]
    CLI["frankenbeast CLI"]
    Comms["franken-comms"]
    Orchestrator["franken-orchestrator"]
    Firewall["MOD-01 firewall"]
    Skills["MOD-02 skills"]
    Brain["MOD-03 brain"]
    Planner["MOD-04 planner"]
    Observer["MOD-05 observer"]
    Critique["MOD-06 critique"]
    Governor["MOD-07 governor"]
    Heartbeat["MOD-08 heartbeat"]
    MCP["franken-mcp"]

    User --> Dashboard --> Orchestrator
    User --> CLI --> Orchestrator
    User --> Comms --> Orchestrator

    Orchestrator --> Firewall
    Orchestrator --> Brain
    Orchestrator --> Planner
    Orchestrator --> Critique
    Orchestrator --> Skills
    Orchestrator --> Governor
    Orchestrator --> Observer
    Orchestrator --> Heartbeat
    Skills --> MCP
```

### Target Full Beast Loop

In the target architecture, all 8 modules participate as real components rather than a mix of graph builders and stubs.

```mermaid
sequenceDiagram
    participant Input as User / API / Comms
    participant Orch as Orchestrator
    participant FW as Firewall
    participant Brain as Brain
    participant Planner as Planner
    participant Crit as Critique
    participant Skills as Skills
    participant Gov as Governor
    participant MCP as MCP
    participant Obs as Observer
    participant HB as Heartbeat

    Input->>Orch: request / command / message
    Orch->>FW: sanitize + validate inbound request
    FW-->>Orch: sanitized intent + violations
    Orch->>Brain: hydrate working + episodic + semantic context
    Brain-->>Orch: memory context

    loop plan/critique loop
        Orch->>Planner: create PlanGraph
        Planner-->>Orch: plan + rationale
        Orch->>Crit: review plan
        Crit-->>Orch: verdict + findings + score
    end

    loop topological task execution
        Orch->>Gov: approval gate for risky actions
        Gov-->>Orch: approve / reject / escalate
        Orch->>Skills: execute approved task
        Skills->>MCP: discover/call external tools when needed
        MCP-->>Skills: tool results
        Skills-->>Orch: task output
        Orch->>Brain: record episodic trace
        Orch->>Obs: spans, costs, metrics
    end

    Orch->>HB: pulse / reflection / follow-up opportunities
    HB-->>Orch: improvements + summary
    Orch-->>Input: final response / status / artifacts
```

### Target Planning and Critique Loop

```mermaid
flowchart TD
    Goal["Sanitized goal + memory context"]
    Intent["intent parser / strategy selection"]
    DAG["planner DAG builder"]
    CoT["CoT gate / rationale block"]
    Review["critique evaluators"]
    Pass{"approved?"}
    HITL["governor escalation"]
    Plan["Approved PlanGraph"]

    Goal --> Intent --> DAG --> CoT --> Review --> Pass
    Pass -->|yes| Plan
    Pass -->|retry| Intent
    Pass -->|escalate| HITL
```

Target differences from current:

- planner owns task generation instead of relying mostly on external graph builders
- critique is a real loop, not a stub
- plan approval can escalate through governor instead of failing only as a local critique spiral

### Target Execution, Tooling, and Approval Flow

```mermaid
flowchart LR
    Task["PlanTask"]
    Gov["Governor triggers + approval channels"]
    Exec["Skills module"]
    Registry["Skill registry"]
    MCP["MCP registry + clients"]
    Tool["external tool / CLI / server"]
    Observer["Observer"]
    Brain["Brain episodic recorder"]

    Task --> Gov
    Gov -->|approved| Exec
    Exec --> Registry
    Exec --> MCP --> Tool
    Tool --> Exec
    Exec --> Observer
    Exec --> Brain
```

### Target External Comms Gateway Flow

This is the target shape described by ADR-016.

```mermaid
flowchart TD
    Slack["Slack / Discord / Telegram / WhatsApp"]
    Verify["channel signature verification + schema validation"]
    Normalize["ChannelInboundMessage normalization"]
    SessionMap["deterministic session mapping"]
    Gateway["franken-comms gateway"]
    WS["/v1/chat/ws"]
    Runtime["shared ChatRuntime / ConversationEngine"]
    Stream["streamed events + approval prompts"]

    Slack --> Verify --> Normalize --> SessionMap --> Gateway --> WS --> Runtime --> Stream
    Stream --> Gateway --> Slack
```

Target intent:

- all external channels reuse the same canonical conversation model
- the gateway handles platform verification and normalization at the edge
- the orchestrator remains the single source of runtime behavior

### Target Observability and Memory Flow

```mermaid
flowchart TD
    Event["task execution / tool call / model response"]
    Span["TraceContext + SpanLifecycle"]
    Cost["token counting + cost attribution"]
    Export["export adapters"]
    Stores["Tempo / Prometheus / Langfuse / SQLite / webhook"]
    Memory["episodic + semantic memory stores"]
    Eval["evals / loop detection / incident analysis"]

    Event --> Span --> Cost --> Export --> Stores
    Event --> Memory
    Span --> Eval
    Memory --> Eval
```

This is broader than the current local CLI path, where observer telemetry is real but the full memory and evaluation ecosystem is only partially wired into day-to-day execution.

### Target Operator Control Plane

```mermaid
flowchart LR
    Operator["CLI operator or dashboard operator"]
    Network["network operator"]
    Config["canonical config + secret refs"]
    Secret["secret resolver / backend"]
    Services["chat server / dashboard / comms / future services"]
    State["shared state + logs + status APIs"]

    Operator --> Network --> Config
    Config --> Secret
    Network --> Services
    Services --> State
    State --> Operator
```

The target goal is one canonical service control model across CLI and dashboard, with secret resolution and service state handled consistently.

## Current vs Target Summary

| Area | Current | Target |
|---|---|---|
| Ingestion | real firewall possible through dep factory | fully wired firewall in all entry modes |
| Memory | episodic memory adapter can be real | full working + episodic + semantic memory |
| Planning | usually graph-builder driven; planner often stubbed | planner owns graph generation with critique loop |
| Critique | stubbed in local CLI dep path | real critique loop with escalation |
| Execution | real CLI execution, chunk sessions, checkpoints, observer | same plus broader tool and policy integrations |
| Governance | dashboard/operator auth and run control exist; local CLI governor still stubbed | true HITL gating inside task execution |
| Chat | real HTTP + websocket dashboard chat | same shared runtime extended to all channels |
| External comms | package exists but gateway shape is still target-oriented | normalized multi-channel ingress via comms gateway |
| Control plane | network operator manages local services | one canonical service model with secret-aware ops |

## Related Documents

- [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/RAMP_UP.md](./RAMP_UP.md)
- [docs/adr/017-network-operator-control-plane.md](./adr/017-network-operator-control-plane.md)
- [docs/adr/018-tracked-agent-init-workflow.md](./adr/018-tracked-agent-init-workflow.md)
- [docs/adr/020-standardized-issue-execution-path.md](./adr/020-standardized-issue-execution-path.md)
- [packages/franken-orchestrator/docs/RAMP_UP.md](../packages/franken-orchestrator/docs/RAMP_UP.md)
