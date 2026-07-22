# ADR-039: Real token/context usage instrumentation for interactive chat

## Status

Accepted

## Context

`fbeast chat`'s CLI surfaces were restyled to feel like Claude Code / Codex CLI /
Gemini CLI / Hermes (see the terminal-rendering work on `feat/cli-terminal-chat`).
Those agent CLIs all show a live status line with real context-window usage,
token counts, compaction/compression events, and session duration.

Frankenbeast's interactive chat pipeline (`ConversationEngine` → `TurnRunner` →
`ChatRuntime`, driven by `ILlmClient.complete()`) had no token usage data at all:
`complete()` returns a bare `string`. The one place usage was estimated
(`AdapterLlmClient`'s observer span) used `Math.ceil(text.length / 4)` —
a character-count guess, not real provider-reported numbers.

Meanwhile the underlying CLI providers (Claude Code CLI, Codex CLI, Gemini CLI)
already emit real per-turn token usage in their own stream-json/NDJSON output
when invoked with `--output-format stream-json` / `--json` — the Beast-loop's
separate streaming provider adapters (`providers/*.ts`, implementing
`ILlmProvider.execute(): AsyncIterable<LlmStreamEvent>`) already parse this into
`TokenUsage`. The chat-path adapters (`skills/providers/*.ts`, implementing the
lower-level `ICliProvider` contract used by `AdapterLlmClient`/`CliLlmAdapter`)
capture the same raw stdout but discarded everything except display text.

We had three options for the status line's numbers:
1. **Fabricate/estimate** — cheap, ships immediately, but the numbers would be
   guesses dressed up as fact.
2. **Omit the token/context bar entirely** — honest, but leaves the CLI further
   from feeling like the agent CLIs it's modeled on.
3. **Wire real usage through** — extend `ILlmClient` and the provider chain so
   the numbers are genuinely what the underlying model reported. Larger,
   contained architectural change.

The user explicitly chose option 3.

## Decision

- `ICliProvider` (the chat-path provider contract) gains an optional
  `extractUsage(raw: string): TokenUsage | undefined`, implemented by the real
  CLI providers (`ClaudeProvider`, `CodexProvider`, `GeminiProvider`) via a
  shared NDJSON usage parser (`stream-json-utils.ts`), reusing the same
  `usage.input_tokens`/`output_tokens` field aliases the streaming adapters
  already parse. `AiderProvider` (no JSON output) leaves it unimplemented —
  callers treat "no usage" as "unknown", never as zero.
- `IAdapter.transformResponse` (in `adapter-llm-client.ts`) returns
  `{ content, usage? }` instead of bare `{ content }`. `CliLlmAdapter` populates
  `usage` by calling the resolved provider's `extractUsage` on the raw stdout it
  already captured — no new subprocess calls, no new parsing surface.
- `ILlmClient` gains an **optional** `completeWithUsage?(prompt, options):
  Promise<{ text: string; usage?: TokenUsage }>`. Additive only — every existing
  `ILlmClient` implementation (mocks, other adapters) is untouched and keeps
  working via plain `complete()`. `AdapterLlmClient` implements it by factoring
  its existing `complete()` body into a shared private method.
- `ConversationEngine.processTurn()` prefers `completeWithUsage` when the
  injected client supports it (duck-typed `typeof llm.completeWithUsage ===
  'function'`), and records the resulting token count directly on the
  assistant's `TranscriptMessage.tokens` — a field the shared `@franken/types`
  schema already declared but nothing populated. `PromptBuilder.build()` now
  returns `{ prompt, truncated }` instead of a bare string, so the engine can
  report whether this turn's history was actually truncated (frankenbeast's
  analogue of the agent-CLIs' "compaction" event).
- `ChatRuntimeResult` gains optional `usage`/`truncated` for the turn that just
  ran. **Cumulative** totals (running token count, compaction count, session
  duration) are deliberately *not* tracked as new server-side state — each
  rendering surface (the local REPL, the managed-attach CLI) already owns a
  transcript/session loop and accumulates locally, the same way `ChatRepl`
  already tracks `this.pendingApproval` locally rather than round-tripping
  through persisted state every turn. This keeps `ChatRuntime`/`ChatSession`
  safely shared across concurrent sessions (as `ws-chat-server.ts` requires)
  without adding per-session mutable fields to a shared object graph.
- The managed-attach (WebSocket) path reuses the `?features=…` opt-in
  negotiation already introduced for `kind` on `assistant.message.complete`
  (strict v1 socket schemas reject unknown fields, so extensions are opt-in
  per connection): a new `usage-stats` feature adds `usage`/`truncated` to the
  same event for peers that request it. Legacy peers are unaffected.
- Context-window percentage uses `ICliProvider.defaultContextWindowTokens()`
  (already declared per-provider) resolved once in `createChatSurfaceDeps()`
  and threaded into `ChatReplOptions`. The managed-attach client does not have
  this value today and gracefully degrades to a bare token count with no
  percentage bar, rather than inventing one.

## Consequences

**Easier:**
- The status line's token/context numbers are real, not estimated — matching
  the standard other agent CLIs set.
- The previously-dead `TranscriptMessage.tokens` field and the
  budget-enforcement check in `ConversationEngine` (which read
  `message.costUsd`/relied on populated fields) get real data to work with as
  a side effect, rather than silently no-op'ing.
- Future consumers (e.g. the web dashboard) can read the same `tokens` field
  from persisted transcripts without new plumbing.

**Harder:**
- `IAdapter`/`ILlmClient`/`ICliProvider` all grew a new optional surface;
  future `ILlmClient` implementations that want real usage must implement
  `completeWithUsage`, and future `ICliProvider`s that want it must implement
  `extractUsage`. Both are optional by design, so nothing is forced to comply,
  but it is one more contract to remember when adding a provider.
- Two independent chat-usage-tracking surfaces (local REPL, managed-attach)
  each keep their own cumulative counters rather than a single shared source
  of truth — acceptable since each surface's session lifetime and reconnection
  semantics already differ, but worth remembering if a third surface
  (e.g. the web dashboard's WS client) needs the same treatment later.
