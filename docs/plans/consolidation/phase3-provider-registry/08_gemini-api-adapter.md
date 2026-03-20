# Chunk 3.8: Gemini API Adapter

**Phase:** 3 — Provider Registry + Adapters
**Depends on:** Chunk 3.1 (provider interfaces)
**Estimated size:** Small-Medium (~80 lines + tests)

---

## Purpose

Implement `GeminiApiAdapter` using the `@google/genai` SDK for streaming Gemini API calls. Fallback when Gemini CLI is unavailable.

## Implementation

```typescript
// packages/franken-orchestrator/src/providers/gemini-api-adapter.ts

import { GoogleGenAI } from '@google/genai';
import type { ILlmProvider, LlmRequest, LlmStreamEvent, ProviderCapabilities, BrainSnapshot } from '@frankenbeast/types';

export class GeminiApiAdapter implements ILlmProvider {
  readonly name = 'gemini-api';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 1_000_000,
    mcpSupport: false,
    skillDiscovery: false,
  };

  private client: GoogleGenAI;

  constructor(private options: {
    apiKey?: string;       // defaults to GOOGLE_API_KEY or GEMINI_API_KEY env var
    model?: string;        // default: 'gemini-2.5-flash'
    maxTokens?: number;
  } = {}) {
    this.client = new GoogleGenAI({
      apiKey: options.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
    });
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.options.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  }

  async *execute(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const model = this.options.model ?? 'gemini-2.5-flash';

    try {
      const response = await this.client.models.generateContentStream({
        model,
        contents: this.translateMessages(request),
        systemInstruction: request.systemPrompt,
        tools: request.tools ? this.translateTools(request.tools) : undefined,
        config: {
          maxOutputTokens: request.maxTokens ?? this.options.maxTokens ?? 4096,
          temperature: request.temperature,
        },
      });

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for await (const chunk of response) {
        // Extract text content
        if (chunk.text) {
          yield { type: 'text', content: chunk.text };
        }

        // Extract function calls
        if (chunk.functionCalls) {
          for (const call of chunk.functionCalls) {
            yield {
              type: 'tool_use',
              id: call.id ?? crypto.randomUUID(),
              name: call.name,
              input: call.args,
            };
          }
        }

        // Track usage
        if (chunk.usageMetadata) {
          totalInputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          totalOutputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
        }
      }

      yield {
        type: 'done',
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
      yield { type: 'error', error: message, retryable };
    }
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    // Same readable format, injected as system instruction
  }

  private translateMessages(request: LlmRequest): unknown[] {
    // Translate LlmMessage[] → Gemini Content[] format
    // Gemini uses { role: 'user'|'model', parts: [{ text }] }
  }

  private translateTools(tools: ToolDefinition[]): unknown[] {
    // Translate to Gemini function declarations
    // { functionDeclarations: [{ name, description, parameters }] }
  }
}
```

## Key Differences from Other API Adapters

1. **SDK:** `@google/genai` (Google's official SDK)
2. **System prompt:** Passed as `systemInstruction`, not as a message
3. **Message format:** Uses `role: 'model'` (not `'assistant'`), and `parts: [{ text }]`
4. **Tool format:** Uses `functionDeclarations` wrapper
5. **Streaming:** `generateContentStream()` returns chunks with `.text` and `.functionCalls`
6. **Error handling:** Rate limits use gRPC-style `RESOURCE_EXHAUSTED` or HTTP 429
7. **API key env vars:** Checks both `GOOGLE_API_KEY` and `GEMINI_API_KEY`

## Tests

```typescript
// packages/franken-orchestrator/tests/unit/providers/gemini-api-adapter.test.ts

describe('GeminiApiAdapter', () => {
  describe('isAvailable()', () => {
    it('returns true when GOOGLE_API_KEY is set', () => { ... });
    it('returns true when GEMINI_API_KEY is set', () => { ... });
    it('returns false when no API key', () => { ... });
  });

  describe('execute()', () => {
    it('calls generateContentStream with correct params', () => { ... });
    it('translates text chunks', () => { ... });
    it('translates function call chunks', () => { ... });
    it('accumulates usage metadata across chunks', () => { ... });
    it('emits done event with final usage', () => { ... });
    it('emits retryable error on RESOURCE_EXHAUSTED', () => { ... });
    it('passes systemInstruction from systemPrompt', () => { ... });
  });

  describe('formatHandoff()', () => {
    it('formats brain snapshot as readable text', () => { ... });
  });

  describe('translateMessages()', () => {
    it('maps assistant to model role', () => { ... });
    it('wraps content in parts array', () => { ... });
  });
});
```

## Files

- **Add:** `packages/franken-orchestrator/src/providers/gemini-api-adapter.ts`
- **Add:** `packages/franken-orchestrator/tests/unit/providers/gemini-api-adapter.test.ts`
- **Modify:** `packages/franken-orchestrator/package.json` — add `@google/genai` dependency

## Exit Criteria

- `GeminiApiAdapter` implements `ILlmProvider`
- Streams via `generateContentStream()` and translates events
- Handles both text and function call chunks
- Rate limits mapped to retryable errors
- Unit tests mock the SDK
