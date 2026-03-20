# Phase 3: Provider Registry + Adapters

**Goal:** The orchestrator can execute LLM requests through any configured provider with automatic failover and brain state handoff between providers.

**Dependencies:** Phase 2 (needs `BrainSnapshot` types and `SqliteBrain.serialize()`)

**Why this matters:** This is the core of provider-agnostic execution. Without it, Frankenbeast is locked to a single LLM provider. With it, a task can start on Claude, fail over to Codex on rate limit, and resume on Gemini — all with preserved context.

---

## Architecture

```
┌─────────────────────────────────────────┐
│              ProviderRegistry            │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Claude  │ │  Codex  │ │  Gemini  │  │
│  │ CLI     │ │  CLI    │ │  CLI     │  │
│  └─────────┘ └─────────┘ └──────────┘  │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │Anthropic│ │ OpenAI  │ │ Gemini   │  │
│  │ API     │ │  API    │ │  API     │  │
│  └─────────┘ └─────────┘ └──────────┘  │
│                                          │
│  Failover: provider1 → provider2 → ...  │
│  On fail: brain.serialize() → handoff   │
└─────────────────────────────────────────┘
```

All 6 adapters implement `ILlmProvider`. The registry tries them in configured order. On failure, it serializes brain state and hands off to the next provider via `formatHandoff()`.

### Provider Types

**CLI adapters** (~100 lines each) — spawn the provider's CLI tool as a child process:
- Parse NDJSON streaming output into `LlmStreamEvent`
- Handle environment variable sanitization (strip parent `CLAUDE*` vars, etc.)
- Translate MCP skill configs to provider-specific format

**API adapters** (~80 lines each) — use the provider's SDK directly:
- Direct HTTP streaming via official SDKs
- No child process overhead
- Fallback when CLI is unavailable

### v1 Scope

- **Fully working:** Claude CLI + Anthropic API adapters
- **Unit tested with mocked CLIs:** Codex CLI, Gemini CLI
- **Unit tested with mocked APIs:** OpenAI API, Gemini API
- Provider failover integration test with mocked providers

## Success Criteria

- `ILlmProvider` interface defined in `franken-types`
- `ProviderRegistry` executes requests with automatic failover
- Claude CLI adapter spawns `claude -p --output-format stream-json` and parses output
- Anthropic API adapter streams via `@anthropic-ai/sdk`
- Brain state is serialized and handed off on provider switch
- Failover integration test proves the chain works

## Chunks

| # | Chunk | Committable Unit | Can Parallel? |
|---|-------|-----------------|--------------|
| 01 | [Provider interfaces + types](phase3-provider-registry/01_provider-interfaces-types.md) | Types in `franken-types` | First |
| 02 | [ProviderRegistry](phase3-provider-registry/02_provider-registry.md) | Registry with failover logic | After 01 |
| 03 | [Claude CLI adapter](phase3-provider-registry/03_claude-cli-adapter.md) | Spawn + parse + handoff | After 01 |
| 04 | [Codex CLI adapter](phase3-provider-registry/04_codex-cli-adapter.md) | Spawn + parse + handoff | After 01 |
| 05 | [Gemini CLI adapter](phase3-provider-registry/05_gemini-cli-adapter.md) | Spawn + parse + handoff | After 01 |
| 06 | [Anthropic API adapter](phase3-provider-registry/06_anthropic-api-adapter.md) | SDK streaming + handoff | After 01 |
| 07 | [OpenAI API adapter](phase3-provider-registry/07_openai-api-adapter.md) | SDK streaming + handoff | After 01 |
| 08 | [Gemini API adapter](phase3-provider-registry/08_gemini-api-adapter.md) | SDK streaming + handoff | After 01 |
| 09 | [Provider failover integration test](phase3-provider-registry/09_provider-failover-integration.md) | E2E failover test | After 02 + all adapters |
| 10 | [Cross-provider token aggregation](phase3-provider-registry/10_cross-provider-token-aggregation.md) | `TokenAggregator` + BudgetTrigger wiring | After 02 + 09 |

**Parallelism:** Chunk 01 first. Chunks 02–08 can all run in parallel. Chunk 09 after all adapters and registry are complete. Chunk 10 after 09.

## Risks

| Risk | Mitigation |
|------|-----------|
| CLI output formats change between versions | Pin CLI versions in test fixtures. Use integration test fixtures that capture real output. |
| API SDK breaking changes | Pin SDK versions. Wrap SDK calls in thin adapter methods. |
| Codex/Gemini CLI not installed in CI | Mock the child process spawn in unit tests. Only Claude CLI + Anthropic API need real integration tests for v1. |
| `formatHandoff()` context is too large for some providers | Add truncation logic with token counting. Include a `maxHandoffTokens` capability on each adapter. |
