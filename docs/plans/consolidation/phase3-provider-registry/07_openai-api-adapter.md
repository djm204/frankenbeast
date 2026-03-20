# Chunk 3.7: OpenAI API Adapter

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Small-Medium (~80 lines + tests)

---

## Purpose

Implement `OpenAiApiAdapter` using the `openai` SDK for streaming chat completions. Serves as an alternative API-based provider for when Codex CLI is unavailable.

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/openai-api-adapter.ts

import OpenAI from 'openai';
import type { ILlmProvider, LlmRequest, LlmStreamEvent, ProviderCapabilities, BrainSnapshot } from '@frankenbeast/types';

export class OpenAiApiAdapter implements ILlmProvider {
  readonly name = 'openai-api';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 128_000,
    mcpSupport: false,
    skillDiscovery: false,
  };

  private client: OpenAI;

  constructor(private options: {
    apiKey?: string;          // defaults to OPENAI_API_KEY env var
    model?: string;           // default: 'gpt-4o'
    maxTokens?: number;       // default: 4096
  } = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey,  // SDK reads OPENAI_API_KEY if not provided
    });
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.options.apiKey || process.env.OPENAI_API_KEY);
  }

  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const model = this.options.model ?? 'gpt-4o';
    try {
      const stream = await this.client.chat.completions.create({
        model,
        max_tokens: request.maxTokens ?? this.options.maxTokens ?? 4096,
        messages: this.translateMessages(request),
        tools: request.tools ? this.translateTools(request.tools) : undefined,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const translated = this.translateChunk(chunk);
        if (translated) yield translated;
      }
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) {
        yield { type: 'error', error: 'Rate limit exceeded', retryable: true };
      } else if (error instanceof OpenAI.AuthenticationError) {
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
    // Same readable format as other adapters, injected as system message
  }

  private translateMessages(request: LlmRequest): OpenAI.ChatCompletionMessageParam[] {
    // System prompt → { role: 'system', content: request.systemPrompt }
    // Then map request.messages → OpenAI format
  }

  private translateTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    // ToolDefinition → { type: 'function', function: { name, description, parameters } }
  }

  private translateChunk(chunk: OpenAI.ChatCompletionChunk): LlmStreamEvent | null {
    // delta.content → { type: 'text', content }
    // delta.tool_calls → { type: 'tool_use', id, name, input }
    // usage (final chunk) → { type: 'done', usage }
    // finish_reason: 'stop' → handled via usage chunk
  }
}
```

## Key Differences from Anthropic

1. **Message format:** OpenAI uses `role: 'system'` for system prompt (Anthropic uses a separate `system` field)
2. **Tool format:** OpenAI wraps tools in `{ type: 'function', function: { ... } }`
3. **Stream format:** OpenAI uses `ChatCompletionChunk` with `delta` fields
4. **Usage reporting:** OpenAI includes usage in the final stream chunk with `stream_options: { include_usage: true }`

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/openai-api-adapter.test.ts

describe('OpenAiApiAdapter', () => {
  describe('isAvailable()', () => {
    it('returns true when API key is set', () => { ... });
    it('returns false when no API key', () => { ... });
  });

  describe('execute()', () => {
    it('calls completions.create with stream: true', () => { ... });
    it('translates text chunks', () => { ... });
    it('translates tool call chunks', () => { ... });
    it('emits done event with usage from final chunk', () => { ... });
    it('emits retryable error on rate limit', () => { ... });
    it('includes system message from systemPrompt', () => { ... });
  });

  describe('formatHandoff()', () => {
    it('formats brain snapshot as readable text', () => { ... });
  });

  describe('translateMessages()', () => {
    it('prepends system message', () => { ... });
    it('maps user and assistant messages', () => { ... });
  });

  describe('translateTools()', () => {
    it('wraps in function type', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/openai-api-adapter.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/openai-api-adapter.test.ts`
- **Modify:** `packages/franken-orchestrator/package.json` — add `openai` dependency

## Exit Criteria

- `OpenAiApiAdapter` implements `ILlmProvider`
- Streams via `client.chat.completions.create({ stream: true })`
- Translates OpenAI stream chunks to `LlmStreamEvent`
- Error classification matches OpenAI SDK error types
- Unit tests mock the SDK
