# Chunk 3.6: Anthropic API Adapter

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Small-Medium (~80 lines + tests)

---

## Purpose

Implement `AnthropicApiAdapter` that uses the `@anthropic-ai/sdk` directly for streaming LLM calls. This is the fallback when Claude CLI is unavailable and is the second fully-working v1 adapter (alongside Claude CLI).

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/anthropic-api-adapter.ts

import Anthropic from '@anthropic-ai/sdk';
import type { ILlmProvider, LlmRequest, LlmStreamEvent, ProviderCapabilities, BrainSnapshot } from '@frankenbeast/types';

export class AnthropicApiAdapter implements ILlmProvider {
  readonly name = 'anthropic-api';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 200_000,
    mcpSupport: false,    // API doesn't support MCP directly
    skillDiscovery: false,
  };

  private client: Anthropic;

  constructor(private options: {
    apiKey?: string;          // defaults to ANTHROPIC_API_KEY env var
    model?: string;           // default: 'claude-sonnet-4-20250514'
    maxTokens?: number;       // default: 4096
  } = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey,  // SDK reads ANTHROPIC_API_KEY if not provided
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Quick check: attempt a minimal API call or verify key format
      // Don't waste tokens — just verify the key is set
      return !!(this.options.apiKey || process.env.ANTHROPIC_API_KEY);
    } catch {
      return false;
    }
  }

  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const model = this.options.model ?? 'claude-sonnet-4-20250514';
    const maxTokens = request.maxTokens ?? this.options.maxTokens ?? 4096;

    try {
      const stream = this.client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: request.systemPrompt,
        messages: this.translateMessages(request.messages),
        tools: request.tools ? this.translateTools(request.tools) : undefined,
        temperature: request.temperature,
      });

      for await (const event of stream) {
        const translated = this.translateEvent(event);
        if (translated) yield translated;
      }

      // Final usage event
      const finalMessage = await stream.finalMessage();
      yield {
        type: 'done',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        yield { type: 'error', error: 'Rate limit exceeded', retryable: true };
      } else if (error instanceof Anthropic.AuthenticationError) {
        yield { type: 'error', error: 'Authentication failed', retryable: false };
      } else {
        yield {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
          retryable: false,
        };
      }
    }
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    // For API adapter: format as system message content
    // Same readable format as CLI, injected into system prompt
    return [
      '--- BRAIN STATE HANDOFF ---',
      `Previous provider: ${snapshot.metadata.lastProvider}`,
      `Switch reason: ${snapshot.metadata.switchReason}`,
      `Tokens used: ${snapshot.metadata.totalTokensUsed}`,
      '',
      'Working memory:',
      JSON.stringify(snapshot.working, null, 2),
      '',
      `Recent events (${snapshot.episodic.length}):`,
      ...snapshot.episodic.slice(-10).map(e => `  [${e.type}] ${e.summary}`),
      snapshot.checkpoint ? `\nCheckpoint: phase=${snapshot.checkpoint.phase}, step=${snapshot.checkpoint.step}` : '',
      '--- END HANDOFF ---',
    ].join('\n');
  }

  private translateMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
    // Translate LlmMessage[] → Anthropic SDK message format
  }

  private translateTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    // Translate ToolDefinition[] → Anthropic SDK tool format
  }

  private translateEvent(event: Anthropic.MessageStreamEvent): LlmStreamEvent | null {
    // Translate Anthropic stream events → LlmStreamEvent
    // content_block_delta with text → { type: 'text', content }
    // content_block_start with tool_use → { type: 'tool_use', ... }
    // Other events → null (skip)
  }
}
```

## Key Design Decisions

1. **No MCP support:** API adapters don't have MCP — tools must be passed as `ToolDefinition[]` in the request. The skill loader (Phase 5) handles this by translating MCP tool schemas to `ToolDefinition` format for API adapters.

2. **Error classification:** Anthropic SDK provides typed error classes (`RateLimitError`, `AuthenticationError`, etc.). Map these to `retryable: true/false` on the `LlmStreamEvent.error`.

3. **Model default:** `claude-sonnet-4-20250514` as default — good balance of capability and cost. User can override via config.

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/anthropic-api-adapter.test.ts

describe('AnthropicApiAdapter', () => {
  // Mock @anthropic-ai/sdk

  describe('isAvailable()', () => {
    it('returns true when API key is set', () => { ... });
    it('returns false when no API key', () => { ... });
  });

  describe('execute()', () => {
    it('calls client.messages.stream with correct params', () => { ... });
    it('translates text stream events', () => { ... });
    it('translates tool_use stream events', () => { ... });
    it('emits done event with token usage from finalMessage', () => { ... });
    it('emits retryable error on RateLimitError', () => { ... });
    it('emits non-retryable error on AuthenticationError', () => { ... });
    it('passes system prompt correctly', () => { ... });
    it('passes tools when provided', () => { ... });
    it('passes temperature when provided', () => { ... });
  });

  describe('formatHandoff()', () => {
    it('formats brain snapshot as readable text', () => { ... });
  });

  describe('translateMessages()', () => {
    it('translates string content messages', () => { ... });
    it('translates content block messages', () => { ... });
    it('translates image content blocks', () => { ... });
  });

  describe('translateTools()', () => {
    it('translates ToolDefinition to Anthropic Tool format', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/anthropic-api-adapter.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/anthropic-api-adapter.test.ts`
- **Modify:** `packages/franken-orchestrator/package.json` — add `@anthropic-ai/sdk` dependency

## Exit Criteria

- `AnthropicApiAdapter` implements `ILlmProvider`
- Streams via `client.messages.stream()` and translates events
- Rate limits mapped to retryable errors
- Auth failures mapped to non-retryable errors
- `formatHandoff()` produces readable text
- Unit tests mock the SDK and cover all event translations
