# Chatbot Implementation Plan — Frankenbeast

> **Methodology:** TDD, small vertical slices, deterministic routing before LLM routing, shared core with thin CLI and web adapters.
> The goal is an OpenClaw-like conversational operator for programming tasks without paying premium-model cost on every turn.

---

## Context

Frankenbeast already has the core execution substrate:

- deterministic ingress and sanitization in the Beast Loop
- provider abstractions and fallback chains
- CLI-oriented premium execution via `MartinLoop` and provider registry
- cost-aware routing examples
- OpenClaw-style external integration example through the firewall

What it does not yet have is a first-class conversational product surface.

This plan adds that surface in two forms:

1. `frankenbeast chat` for local CLI use
2. a web chat interface backed by the same shared conversation engine

The core design constraint is simple:

- normal conversation should use cheap models
- coding, debugging, planning, file changes, test runs, and other complex actions should escalate to premium reasoning/execution paths
- web and CLI must share the same chat state machine, routing policy, and execution semantics

---

## Goals

- Build a shared `ConversationEngine` in `franken-orchestrator`
- Support turn types: `reply`, `clarify`, `plan`, `execute`
- Route simple conversational turns to cheap models by default
- Escalate coding and complex technical work to premium models and Beast Loop execution
- Expose the engine via both CLI and web
- Preserve Frankenbeast guardrails, HITL gates, tracing, and cost visibility

## Non-Goals

- General consumer chat product features
- Multi-user collaboration in v1
- Voice, mobile app, or browser extension support
- Autonomous background execution beyond the current explicit session model

---

## Architectural Principles

- **One chat core, multiple surfaces.** CLI and web are adapters, not separate implementations.
- **Deterministic first.** Intent routing starts with rules and schemas before any classifier call.
- **Cheap by default.** Premium models are reserved for tasks that justify them.
- **Execution is explicit.** Conversational turns decide whether to answer, ask, plan, or execute.
- **Guardrails stay outside the model.** Firewall, validation, cost limits, and HITL remain deterministic.
- **UI stays thin.** The backend owns routing, session state, and tool activity semantics.

---

## Target Repository Layout

### Extend `franken-orchestrator`

```text
franken-orchestrator/
├── docs/
│   ├── RAMP_UP.md
│   └── chatbot-implementation-plan.md
├── src/
│   ├── chat/
│   │   ├── types.ts
│   │   ├── chat-config.ts
│   │   ├── intent-router.ts
│   │   ├── escalation-policy.ts
│   │   ├── conversation-engine.ts
│   │   ├── session-store.ts
│   │   ├── transcript.ts
│   │   ├── turn-runner.ts
│   │   ├── turn-summarizer.ts
│   │   └── prompt-builder.ts
│   ├── http/
│   │   ├── chat-app.ts
│   │   ├── middleware.ts
│   │   ├── routes/
│   │   │   └── chat-routes.ts
│   │   └── sse.ts
│   ├── cli/
│   │   ├── chat-repl.ts
│   │   └── run.ts
│   └── ...
├── tests/
│   ├── unit/chat/
│   ├── integration/chat/
│   └── e2e/chat/
```

### Add a new web package

```text
franken-web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── app.tsx
│   ├── lib/api.ts
│   ├── hooks/
│   │   └── use-chat-session.ts
│   ├── components/
│   │   ├── chat-shell.tsx
│   │   ├── transcript-pane.tsx
│   │   ├── composer.tsx
│   │   ├── activity-pane.tsx
│   │   ├── approval-card.tsx
│   │   └── cost-badge.tsx
│   └── styles/
│       └── app.css
```

`franken-web` should contain presentation only. It should never own routing policy or execution rules.

---

## Product Model

Each user turn produces exactly one engine-level outcome:

- `reply`: answer directly with no expensive execution
- `clarify`: ask a narrow follow-up question before acting
- `plan`: produce an actionable plan without executing
- `execute`: run the premium programming path

The engine should also emit a model tier decision:

- `cheap`
- `premium_reasoning`
- `premium_execution`

---

## Chat Session Model

Each chat session should track:

- `sessionId`
- `projectId`
- `repoRoot`
- `createdAt`, `updatedAt`
- transcript messages
- current branch
- recent files touched
- last generated plan summary
- last execution result summary
- pending approval state
- token and cost totals by tier

Recommended v1 persistence:

- start with file-backed JSON session storage in `.frankenbeast/chat/`
- keep the store behind an interface so SQLite can replace it later

---

## Routing Model

### Deterministic turn classification

Create an `IntentRouter` that first uses deterministic signals:

- direct coding verbs: `implement`, `fix`, `refactor`, `write`, `edit`, `add test`
- execution verbs: `run`, `execute`, `open PR`, `commit`, `apply`
- debugging signals: stack traces, test failures, logs, compiler errors
- planning signals: `plan`, `design`, `architecture`, `how would you build`
- ambiguous safety-sensitive verbs: `delete`, `reset`, `drop`, `publish`, `deploy`

Classify into:

- `chat_simple`
- `chat_technical`
- `code_request`
- `repo_action`
- `ambiguous`

### Escalation policy

Default routing:

- `chat_simple` -> `cheap`
- `chat_technical` -> `cheap`, unless complexity triggers are present
- `code_request` -> `premium_execution`
- `repo_action` -> `premium_execution` with possible HITL
- `ambiguous` -> `clarify` or `premium_reasoning`

Complexity triggers:

- asks to modify code
- asks to inspect multiple files
- asks for debugging based on logs/errors
- asks for architecture tradeoffs
- requires tool use, tests, or planning DAG generation
- asks for iterative execution over the repo

Only if deterministic routing cannot confidently decide should the engine call a cheap classifier model.

---

## Model Tier Policy

Add chat-specific config under orchestrator config:

```ts
type ChatMode = 'cheap' | 'premium_reasoning' | 'premium_execution';

interface ChatConfig {
  enabled: boolean;
  defaultMode: ChatMode;
  cheapModel: string;
  premiumReasoningModel: string;
  premiumExecutionProvider: string;
  premiumExecutionFallbackChain: string[];
  maxTranscriptMessages: number;
  maxCheapTurnsBeforeRefresh: number;
  escalationTriggers: string[];
}
```

Recommended defaults:

- cheap model: `gpt-4o-mini` equivalent
- premium reasoning: Claude/Codex tier
- premium execution: existing CLI provider chain such as `claude -> codex -> gemini -> aider`

---

## HTTP API Surface

Use Hono for consistency with other Frankenbeast HTTP services.

### Endpoints

- `POST /v1/chat/sessions`
  - create a session
- `GET /v1/chat/sessions/:id`
  - fetch transcript and current state
- `POST /v1/chat/sessions/:id/messages`
  - submit a user turn and receive the engine decision
- `GET /v1/chat/sessions/:id/stream`
  - SSE stream for tool activity, execution progress, approvals, and final response
- `POST /v1/chat/sessions/:id/approve`
  - approve or reject pending high-stakes actions
- `GET /health`

### Response shape

Keep API responses structured:

- `data` envelope for success
- `error.code`, `error.message`, `error.details` for failures

Validate every request with Zod. Reject unknown fields. Return `422` on payload validation errors.

---

## CLI Surface

Add a new subcommand:

```text
frankenbeast chat [--provider <name>] [--config <path>] [--base-dir <path>]
```

CLI chat behavior:

- starts or resumes a chat session for the current repo
- prints assistant responses incrementally
- shows mode changes: cheap, premium reasoning, premium execution
- surfaces approvals inline
- exposes slash commands:
  - `/plan`
  - `/run`
  - `/status`
  - `/diff`
  - `/approve`
  - `/session`
  - `/quit`

The CLI REPL should call the same `ConversationEngine` as the web API.

---

## Web UI Scope

The v1 web app should include:

- transcript pane
- composer
- current mode badge
- activity panel for tool use and execution events
- approval cards for HITL gates
- cost and token summary

The UI should behave like an operator console, not a generic consumer messenger.

Do not duplicate business logic in the client.

---

## Beast Loop Integration

The chatbot should supervise the Beast Loop rather than replace it.

### Cheap conversational path

- use cheap responder
- answer directly from current transcript and repo-aware context
- no DAG execution

### Premium reasoning path

- synthesize a plan
- maybe inspect repo metadata or context
- return a proposed action without changing files yet

### Premium execution path

- translate the turn into a `BeastInput` or chat-specific execution request
- invoke Beast Loop or `CliSkillExecutor`
- stream progress
- summarize results back into the transcript

The engine should preserve a clean boundary between:

- conversation state
- reasoning/routing state
- execution state

---

## Safety and Governance

Must-have controls for v1:

- firewall scan on every user message before routing
- Zod validation for all API inputs and persisted session payloads
- request size limits
- per-session and per-IP rate limits for HTTP
- HITL gates for destructive repo actions, networked operations, and premium spend thresholds
- structured errors only, never raw stack traces to clients
- prompt injection detection on user turns and relevant tool outputs
- transcript summarization that preserves safety-relevant state

Premium execution should not bypass the existing governor path.

---

## Observability

Track, per chat turn:

- chosen turn action
- routing reason
- chosen model tier
- provider/model used
- tool and execution events
- prompt/completion tokens
- estimated cost
- approval requests and outcomes
- final status

This should flow through existing observer seams where possible.

---

## Implementation Phases

## Phase 0 — ADRs and Contracts

**Goal:** define the boundaries before code

Deliverables:

- `ADR: Shared Conversation Engine`
- `ADR: Cheap-to-Premium Chat Escalation`
- `ADR: Web API + SSE Contract`
- `chat/types.ts`
- `chat/chat-config.ts`

Tests:

- config parsing
- discriminated unions for turn outcomes
- session schema validation

## Phase 1 — Intent Router and Escalation Policy

**Goal:** deterministic routing works before any web or CLI shell exists

Deliverables:

- `chat/intent-router.ts`
- `chat/escalation-policy.ts`
- cheap classifier interface for ambiguous cases

Tests:

- routes simple chat to cheap tier
- routes coding verbs to premium execution
- routes stack traces and test failures to premium execution
- chooses `clarify` when the request is ambiguous
- honors explicit `/plan` and `/run` overrides

## Phase 2 — Conversation Engine and Session Store

**Goal:** shared backend engine capable of handling a full turn

Deliverables:

- `chat/conversation-engine.ts`
- `chat/session-store.ts`
- `chat/transcript.ts`
- `chat/turn-summarizer.ts`

Tests:

- appends transcript messages correctly
- persists and reloads sessions
- records model-tier usage totals
- emits `reply`, `clarify`, `plan`, and `execute` outcomes

## Phase 3 — Premium Execution Bridge

**Goal:** execution turns invoke Beast Loop cleanly

Deliverables:

- `chat/turn-runner.ts`
- adapter from chat turn to `BeastInput`
- execution event stream model

Tests:

- execution turns call Beast Loop exactly once
- plan-only turns do not mutate files
- approval-required turns pause correctly
- execution results are summarized into transcript state

## Phase 4 — CLI REPL

**Goal:** local conversational workflow from terminal

Deliverables:

- `cli/chat-repl.ts`
- `chat` subcommand in `cli/args.ts`
- `cli/run.ts` wiring

Tests:

- subcommand parsing
- slash command handling
- resume existing session
- show approval prompts and outcomes

## Phase 5 — HTTP API and Streaming

**Goal:** backend service for web UI and external consumers

Deliverables:

- `http/chat-app.ts`
- `http/routes/chat-routes.ts`
- `http/sse.ts`
- request validation and error middleware

Tests:

- create session
- submit turn
- validation failures return `422`
- SSE emits ordered events for execution turns
- approval endpoint updates pending state correctly

## Phase 6 — Web UI

**Goal:** operator-friendly browser interface

Deliverables:

- new `franken-web` package
- transcript, composer, activity panel, approval UI, cost badge

Tests:

- render transcript from session fetch
- send message updates transcript
- activity stream updates UI
- approval interaction works end to end against mocked API

## Phase 7 — Hardening and E2E

**Goal:** prove the full conversational product works

Deliverables:

- transcript truncation and summarization policy
- cost budget checks
- rate-limit handling for provider fallback
- injection and validation regression tests

E2E scenarios:

- simple cheap chat
- explain code without execution
- fix failing test through premium execution
- approval gate on destructive request
- web session resume after backend restart
- CLI session resume after process restart

---

## Suggested Delivery Order

1. Build chat contracts and config
2. Build router and escalation policy
3. Build shared conversation engine and session store
4. Bridge execution turns into Beast Loop
5. Add CLI chat surface
6. Add HTTP API and SSE
7. Add web UI
8. Harden with integration and E2E coverage

This order keeps the hardest logic in the shared core before spending time on shells.

---

## First Milestone

The first meaningful milestone is:

**"I can run `frankenbeast chat`, ask a normal programming question, get a cheap-model answer, then ask it to fix code and watch it escalate into premium execution."**

Until that works in the CLI, the web UI should not be considered the critical path.

---

## Exit Criteria

The chatbot portion is v1-complete when all of the following are true:

- CLI and web both use the same `ConversationEngine`
- cheap chat turns do not invoke premium execution
- coding turns reliably escalate
- approvals work for high-stakes actions
- cost and model-tier decisions are visible
- session resume works
- unit, integration, and E2E tests cover the core flows

