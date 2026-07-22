# ADR-040: Give chat real runtime self-awareness of provider/model and fallbacks

## Status

Accepted

## Context

ADR-039 gave `fbeast chat`'s status line real token/context usage. It did not
give the *model itself* any way to know which provider actually served it.
Observed live behavior exposed the gap directly: running with `--provider
codex`, a rate limit silently fell back to Claude mid-session. The status
line kept showing the static configured label ("codex"), and when asked
"which model are you" / "is this a fallback?", the model answered from its
own training-time self-description ("I'm Sonnet 5... no fallback logic
here") — confidently wrong, because it has no channel to the runtime facts.

The underlying facts already existed and were simply discarded:
- `CliLlmAdapter.execute()` already emits `{ type: 'fallback', from, to }`
  lifecycle events when a rate limit or spawn failure triggers a provider
  switch, and already tracks which provider produced each response
  (`responseProviders`) for use inside `transformResponse()`.
- `ChatRuntimeResult` already declared a `providerContext` field (the exact
  shape needed) — nothing had ever populated it.

Two problems needed solving together: (1) make this data flow all the way
to the model's own prompt so it can answer truthfully, and (2) stop the
status line from contradicting the model's own truthful answer.

## Decision

- `CliLlmAdapter` now tracks, per request, whether `execute()`'s active
  provider differs from the one it started with, and why (`rate_limited` at
  the two `fallback` lifecycle sites triggered by rate limiting;
  `unavailable` at the one triggered by a spawn failure). This is exposed as
  `providerContext: { provider, model?, switchedFrom?, switchReason? }`
  alongside `content`/`usage` from `transformResponse()` — the same
  established pattern as ADR-039's usage plumbing, all the way up through
  `AdapterLlmClient.completeWithUsage()`.
- `ConversationEngine.processTurn()` accepts `priorProviderContext` (the last
  *known* provider state, from an already-completed turn) and, when present,
  appends a short "Runtime status: …" note to the prompt describing the
  current provider/model and, if applicable, that a fallback occurred and
  why — with an explicit instruction to answer truthfully rather than guess
  from training data. This is deliberately based on the **last known** state,
  not the current turn's own outcome: whether *this* call falls back isn't
  knowable until after it completes, so a brand-new fallback is only
  reported starting the *next* turn. That's an acceptable, honest limit (you
  can't report the future), and it's exactly enough to fix the reproduced
  case: turn 1's fallback becomes known before turn 2 begins.
- `ChatRuntimeState` gains `lastProviderContext`, carried forward by the
  caller exactly like `pendingApproval` — deliberately *not* new mutable
  state inside the shared `ChatRuntime`/`ConversationEngine` instances (both
  are shared across concurrent sessions in the HTTP/WS server). `ChatRuntime`
  always reports the best-known `providerContext` on every result — including
  turns that never touch the LLM (`/status`, plan, execute) — so callers
  never need their own fallback logic; this mirrors how `pendingApproval` is
  always present regardless of what changed that turn.
- Both `ChatRepl` (local CLI) and the managed WebSocket path
  (`ws-chat-server.ts` persisting `providerContext` on `ChatSession`,
  `chat-attach.ts` receiving it) carry this state forward across turns within
  their own session lifetime — consistent with ADR-039's approach of
  per-surface local accumulation rather than new shared state.
- The status line's model label now prefers the real serving
  provider/model once any turn has reported it, falling back to the
  static configured label only before that's known — so the display can no
  longer contradict what the model itself will truthfully say.
- The WS wire extension reuses ADR-039's `usage-stats` feature opt-in
  (`assistant.message.complete` gains `providerContext`, gated the same way
  `usage`/`truncated` are) rather than inventing a new negotiated feature —
  it's the same class of extra runtime telemetry.
- Deliberately **not persisted across CLI process restarts**: `ChatRepl`
  keeps `lastProviderContext` in memory only. A fresh process re-resolves
  providers from scratch (`initialProvider` derives from the *configured*
  provider, not from anything persisted), so a stale fallback record from a
  previous run could falsely claim an ongoing fallback that no longer
  applies once, e.g., the rate-limited provider recovers. The managed WS
  server *does* persist it on `ChatSession` — that process is long-running
  and the state only goes stale across a full server restart, an accepted,
  pre-existing risk shared with every other session field.

## Update: closing the "unknown model" gap and defaulting to the flagship tier

Live re-testing (`--provider codex`, no fallback this time) found a second
gap: the model correctly said *"I'm running via the Codex CLI provider"*
(the note reached it) but then added *"based on GPT-5"* — pure
confabulation, since `providerContext.model` was genuinely `undefined` and
the note's silence about it read as an invitation to guess rather than a
fact to withhold on. `formatProviderTransparencyNote()` now explicitly says
the model/version is "not exposed to this session — do not name one" and
repeats the instruction not to state one from training data, instead of
just omitting the parenthetical.

Root cause for *why* it was undefined, and the follow-up ask ("the default
should be the flagship/latest"), led to empirically probing the actual
`claude`/`codex`/`gemini` CLI binaries installed in this environment
(not guessed):

- **Codex**: `chatModel` was removed entirely by an earlier commit (#3424,
  same author) after a stale hardcoded `'codex-mini'` had broken chat
  startup once already (#3412). Verified live: with no `--model` override,
  `codex exec` resolves to whatever OpenAI's account-level default currently
  is (observed newer than any string this codebase could hardcode), and
  explicitly probing a plausible flagship string (`gpt-5-codex`) was
  **rejected outright** as unsupported for this account type — confirming
  that guessing here risks literally breaking chat, not just mislabeling
  it. Also confirmed `codex exec --json` never reports a resolved model in
  any event type, so there's no way to recover it after the fact either.
  **Decision: leave `chatModel` unset for Codex, and let the transparency
  note's "unknown, don't guess" wording carry the entire burden.** This is
  the *correct*, not merely acceptable, way to satisfy "default to
  flagship/latest" for a provider whose own default already outpaces
  anything hardcoded here.
- **Claude**: verified live that `claude -p --output-format stream-json`
  reports the resolved model directly (`message.model` on every assistant
  event, and as the key of the terminal `result` event's `modelUsage`) —
  the same way it already reports `usage`. `ICliProvider.extractModel?()`
  (mirroring `extractUsage?()`) parses this, and `CliLlmAdapter
  .transformResponse()` prefers the **live-extracted** model over the
  statically configured one when both are available, since the extracted
  value reflects what actually executed (account-level routing this
  codebase has no other visibility into). `ClaudeProvider.chatModel` is
  bumped from the stale `'claude-sonnet-4-6'` to `'claude-opus-4-8'`
  (verified: `--model opus` resolves to exactly this string) as the
  fallback default when nothing else is known yet (e.g. before the first
  turn completes).
- **Gemini**: bumped from `'gemini-2.0-flash'` (the cheap/fast tier, not a
  stale flagship — the tier itself was wrong) to `'gemini-2.5-pro'`. Not
  empirically verified against a live `gemini` CLI in this environment (no
  authenticated session available) — based on current public model
  naming, flagged as the one value in this change without direct proof.
  `extractModel` was not implemented for Gemini for the same reason: no
  verified evidence of its stream-json shape.

This generalizes the lesson from Codex's `#3412`/`#3424` history: a
hardcoded model-version string is a **liability that goes stale or breaks
outright**, not a convenience. Prefer extracting the CLI's own live report
of what it actually ran; fall back to a static default only where no such
signal exists, and only after confirming empirically that setting one
doesn't foreclose something better the CLI would have chosen itself.

## Consequences

**Easier:**
- "What model are you running?" and "is this a fallback?" now get answers
  grounded in real runtime state instead of the model's own guesswork.
- The status line and the model's own answers can no longer visibly
  contradict each other.
- `ChatRuntimeResult.providerContext` behaves predictably for any future
  caller: always present once known, regardless of turn kind.

**Harder:**
- A brand-new fallback that happens mid-turn is invisible to the model for
  that one turn (see above) — an accepted, disclosed limit, not a bug.
- `ConversationEngineTurnOptions`, `ChatRuntimeState`, `ChatSession`, and the
  WS wire protocol all grew one more optional field each to carry this
  through; each addition follows the same pattern as its neighbors
  (`pendingApproval`, `beastContext`) so it shouldn't add cognitive
  surprise, but it is one more piece of session state to remember when
  adding a new chat surface.
