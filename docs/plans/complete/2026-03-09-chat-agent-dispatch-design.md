# Chat Agent Dispatch Design

**Date:** 2026-03-09
**Status:** Approved
**Branch:** feat/03_escalation-policy

## Goal

Transform `frankenbeast chat` from a conversational-only REPL into a two-tier command center that can both chat cheaply and spawn tool-using agents for real work.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Hybrid | Lightweight spawn for quick tasks (`code_request`), full beast-loop with git isolation for heavy tasks (`repo_action`). Matches existing `EscalationPolicy` tiers. |
| Command triggering | Both slash + NL | `/plan`, `/run` as power-user shortcuts that bypass IntentRouter. Natural language also works via existing classification pipeline. |
| Progress display | Spinner for chat, stream for execution | Chat replies are fast — spinner suffices. Agent tasks need visibility — stream tool-use activity. |
| Multi-agent | Optional, default 1 | `maxAgents: 1` by default (sequential). Optional `--max-agents N` for concurrent dispatch. Interface supports both without redesign. |

## Architecture

### Two-Tier Dispatch

```
User input
  |
  +-- /plan <desc>  -----------> PlanExecutor (beast-loop planning phase)
  +-- /run <desc>   -----------> AgentExecutor (lightweight spawn)
  +-- /approve      -----------> Release pending_approval task
  +-- /quit         -----------> Exit
  +-- natural language
       |
       +-- IntentRouter.classify()
            |
            +-- chat_simple/technical -> LLM reply (chatMode, spinner)
            +-- code_request ----------> AgentExecutor (lightweight, stream progress)
            +-- repo_action -----------> AgentExecutor (git isolation, stream, approval)
            +-- ambiguous -------------> Clarify question
```

### Tier 1: Conversational (cheap, no tools)

- `IntentRouter` classifies as `chat_simple` / `chat_technical`
- `ConversationEngine` calls LLM via `CliLlmAdapter` with `chatMode: true`
- Cheap model (provider's `chatModel`), no `--dangerously-skip-permissions`
- Spinner displayed while waiting for response

### Tier 2: Execution (full model, tools)

- Triggered by intent classification (`code_request` / `repo_action`) or slash commands (`/plan`, `/run`)
- Slash commands bypass `IntentRouter` — create `ExecuteOutcome` / `PlanOutcome` directly

**Lightweight tasks** (`code_request`, `/run`):
- One-shot CLI agent spawn via `CliLlmAdapter` with `chatMode: false`
- Full tool permissions (`--dangerously-skip-permissions`)
- Works in project root directory (not `/tmp`)
- No git isolation — changes land on current branch
- Stream progress shows tool-use activity

**Heavy tasks** (`repo_action`):
- Full `CliSkillExecutor` with git branch isolation, checkpoints
- Requires `/approve` before execution (existing behavior)
- Stream progress with full tool-use display

### Multi-Agent Support

- Default: `maxAgents: 1` — chat waits for agent to finish before accepting next input
- Optional: `--max-agents N` flag or config setting
- When >1, tasks queue and run concurrently up to N
- Each agent's stream progress prefixed with task ID to prevent interleaved output
- `TurnRunner` already emits `start`, `progress`, `complete` events — multiple concurrent runners need a thin dispatcher tracking active/queued tasks

## Components

### New

1. **`ChatAgentExecutor`** (`src/chat/chat-agent-executor.ts`)
   - Implements `ITaskExecutor` interface
   - Replaces the stub executor in chat mode
   - Spawns CLI agent with full permissions via `CliLlmAdapter` (no `chatMode`)
   - Accepts `onStreamLine` callback for progress streaming
   - Returns `ExecutionResult` with summary of what the agent did

2. **Spinner integration in `ChatRepl`**
   - Wrap `engine.processTurn()` with `Spinner.start()` / `Spinner.stop()`
   - Use existing `src/cli/spinner.ts` — no new spinner code needed
   - Abstract spinner wiring into a shared helper for reuse across services

3. **Slash command dispatch** (modify `ChatRepl.handleSlashCommand()`)
   - `/plan <desc>` extracts description, creates `PlanOutcome`, dispatches to `TurnRunner`
   - `/run <desc>` extracts description, creates `ExecuteOutcome`, dispatches to `TurnRunner`
   - Both bypass `IntentRouter` and `ConversationEngine`

### Modified

4. **`ChatRepl.handleExecute()`** — wire `onStreamLine` to `StreamProgress` for live tool-use display during agent execution

5. **`run.ts` chat setup** — replace stub executor with `ChatAgentExecutor`, pass provider/registry for agent spawning

### Reused (no changes needed)

- `Spinner` (`src/cli/spinner.ts`)
- `StreamProgress` (`src/adapters/stream-progress.ts`)
- `ITaskExecutor` interface (`src/chat/turn-runner.ts`)
- `EscalationPolicy` routing logic (`src/chat/escalation-policy.ts`)
- `ICliProvider` / `ProviderRegistry` (`src/skills/providers/cli-provider.ts`)

## Not Building (YAGNI)

- No custom working directory switching from chat — agent works in project root
- No session persistence for agent task results — shown inline
- No streaming token display for chat replies — spinner only
- No multi-agent dispatcher in v1 — just the interface that supports it later
