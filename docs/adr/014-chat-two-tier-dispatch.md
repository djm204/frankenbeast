# ADR-014: Chat Two-Tier Dispatch Architecture

## Status
Accepted

## Context
`frankenbeast chat` was a conversational-only REPL that could answer questions but not take action. Users need it to also spawn agents for code changes, planning, and repo operations — while keeping simple chat cheap and fast.

## Decision
Implement a hybrid two-tier dispatch model within the chat REPL:

- **Tier 1 (Conversational):** Simple/technical chat uses a cheap model with `chatMode: true` (no tool permissions). A spinner shows while waiting.
- **Tier 2 (Execution):** Code requests and repo actions spawn a full-permissions CLI agent via `ChatAgentExecutor`. Lightweight tasks (code_request) run on the current branch. Heavy tasks (repo_action) require `/approve` before execution.

Slash commands (`/plan`, `/run`) bypass the IntentRouter and dispatch directly to execution. Natural language also triggers execution via the existing `IntentRouter` → `EscalationPolicy` pipeline.

Multi-agent support is optional (default: 1 agent at a time). The interface supports `maxAgents > 1` without redesign.

## Consequences
- Chat becomes a command center, not just a chatbot
- Cheap model handles most interactions (cost-efficient)
- Full-permissions agent only spawns when real work is requested
- `/approve` gate on repo actions preserves safety
- Stub executor replaced with real `ChatAgentExecutor`
