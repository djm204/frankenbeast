# ADR-005: Provider-Agnostic LLM Interface

**Date:** 2026-02-19
**Status:** Accepted
**Deciders:** franken-heartbeat team

---

## Context

The reflection engine requires LLM calls for the "expensive" phase: pattern analysis, improvement suggestions, and tech debt scanning. The Frankenbeast system should not be locked to a single LLM provider. Different teams may use Anthropic Claude, OpenAI GPT, or local models.

## Decision

Define an `ILlmClient` interface with a single `complete()` method. The reflection engine depends only on this interface. Concrete implementations (e.g., `ClaudeClient`, `OpenAIClient`) are injected at the composition root.

```typescript
interface ILlmClient {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<Result<string>>;
}
```

The `Result<string>` return type makes LLM failures an expected outcome (not an exception), following the project's Result type pattern.

## Alternatives Considered

| Option | Reason Rejected |
|--------|-----------------|
| Direct Anthropic SDK import | Locks to one provider; hard to test |
| LangChain/LiteLLM abstraction | Heavy dependency for a single `complete()` call |
| Environment-variable provider switch | Still requires concrete imports; not testable |

## Consequences

- **Positive:** Tests use a simple mock — no LLM calls needed.
- **Positive:** Provider can be swapped without touching reflection logic.
- **Negative:** Minimal interface may not cover all LLM features (streaming, tool use).
- **Mitigation:** Interface can be extended when needed; current scope only requires text completion.
