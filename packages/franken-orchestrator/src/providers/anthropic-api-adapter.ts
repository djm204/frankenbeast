import Anthropic from '@anthropic-ai/sdk';
import type {
  ILlmProvider,
  LlmRequest,
  LlmMessage,
  LlmStreamEvent,
  ProviderCapabilities,
  ProviderType,
  ProviderAuthMethod,
  ToolDefinition,
  BrainSnapshot,
} from '@franken/types';
import { formatHandoff } from './format-handoff.js';

export interface AnthropicApiOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicApiAdapter implements ILlmProvider {
  readonly name = 'anthropic-api';
  readonly type: ProviderType = 'anthropic-api';
  readonly authMethod: ProviderAuthMethod = 'api-key';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 200_000,
    mcpSupport: false,
    skillDiscovery: false,
  };

  private client: Anthropic;

  constructor(private options: AnthropicApiOptions = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.options.apiKey || process.env['ANTHROPIC_API_KEY']);
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const model = this.options.model ?? 'claude-sonnet-4-20250514';
    const maxTokens =
      request.maxTokens ?? this.options.maxTokens ?? 4096;

    try {
      const params: Anthropic.MessageStreamParams = {
        model,
        max_tokens: maxTokens,
        system: request.systemPrompt,
        messages: this.translateMessages(request.messages),
      };
      if (request.tools) {
        params.tools = this.translateTools(request.tools);
      }
      if (request.temperature !== undefined) {
        params.temperature = request.temperature;
      }
      const stream = this.client.messages.stream(params);
      const translate = this.createEventTranslator();

      for await (const event of stream) {
        const translated = translate(event);
        if (translated) yield translated;
      }

      const finalMessage = await stream.finalMessage();
      yield {
        type: 'done',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          totalTokens:
            finalMessage.usage.input_tokens +
            finalMessage.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        yield {
          type: 'error',
          error: 'Rate limit exceeded',
          retryable: true,
        };
      } else if (error instanceof Anthropic.AuthenticationError) {
        yield {
          type: 'error',
          error: 'Authentication failed',
          retryable: false,
        };
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
    return formatHandoff(snapshot);
  }

  translateMessages(
    messages: LlmMessage[],
  ): Anthropic.MessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((block) => {
              if (block.type === 'text') return { type: 'text' as const, text: block.text };
              if (block.type === 'image')
                return {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: block.source.mediaType,
                    data: block.source.data,
                  },
                };
              return { type: 'text' as const, text: block.content };
            }),
    }));
  }

  translateTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));
  }

  /**
   * Stateful event translator. Accumulates tool_use input from
   * input_json_delta frames and emits the complete tool_use on
   * content_block_stop — never on content_block_start.
   */
  createEventTranslator(): (event: Anthropic.MessageStreamEvent) => LlmStreamEvent | null {
    let pendingToolUse: { id: string; name: string; inputJson: string } | null = null;

    return (event: Anthropic.MessageStreamEvent): LlmStreamEvent | null => {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          pendingToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          };
        }
        return null;
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          return { type: 'text', content: event.delta.text };
        }
        if (event.delta.type === 'input_json_delta' && pendingToolUse) {
          pendingToolUse.inputJson += (event.delta as { partial_json: string }).partial_json;
        }
        return null;
      }

      if (event.type === 'content_block_stop' && pendingToolUse) {
        let input: unknown = {};
        try {
          input = JSON.parse(pendingToolUse.inputJson);
        } catch { /* empty input */ }
        const result: LlmStreamEvent = {
          type: 'tool_use',
          id: pendingToolUse.id,
          name: pendingToolUse.name,
          input,
        };
        pendingToolUse = null;
        return result;
      }

      return null;
    };
  }
}
