import OpenAI from 'openai';
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

export interface OpenAiApiOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class OpenAiApiAdapter implements ILlmProvider {
  readonly name = 'openai-api';
  readonly type: ProviderType = 'openai-api';
  readonly authMethod: ProviderAuthMethod = 'api-key';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 128_000,
    mcpSupport: false,
    skillDiscovery: false,
  };

  private client: OpenAI | null = null;

  constructor(private options: OpenAiApiOptions = {}) {
    const apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'];
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.options.apiKey });
    }
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.options.apiKey || process.env['OPENAI_API_KEY']);
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const model = this.options.model ?? 'gpt-4o';

    try {
      const params: OpenAI.ChatCompletionCreateParamsStreaming = {
        model,
        max_tokens: request.maxTokens ?? this.options.maxTokens ?? 4096,
        messages: this.translateMessages(request),
        stream: true,
        stream_options: { include_usage: true },
      };
      if (request.tools) {
        params.tools = this.translateTools(request.tools);
      }
      if (request.temperature !== undefined) {
        params.temperature = request.temperature;
      }
      const stream = await this.getClient().chat.completions.create(params);

      const toolCallAccumulators = new Map<
        number,
        { id: string; name: string; argsJson: string }
      >();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (choice) {
          const delta = choice.delta;

          if (delta?.content) {
            yield { type: 'text', content: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (tc.id) {
                toolCallAccumulators.set(idx, {
                  id: tc.id,
                  name: tc.function?.name ?? '',
                  argsJson: tc.function?.arguments ?? '',
                });
              } else {
                const acc = toolCallAccumulators.get(idx);
                if (acc && tc.function?.arguments) {
                  acc.argsJson += tc.function.arguments;
                }
              }
            }
          }

          if (choice.finish_reason === 'tool_calls') {
            for (const acc of toolCallAccumulators.values()) {
              let input: unknown = {};
              try {
                input = JSON.parse(acc.argsJson);
              } catch {
                /* empty */
              }
              yield {
                type: 'tool_use',
                id: acc.id,
                name: acc.name,
                input,
              };
            }
            toolCallAccumulators.clear();
          }
        }

        if (chunk.usage) {
          yield {
            type: 'done',
            usage: {
              inputTokens: chunk.usage.prompt_tokens ?? 0,
              outputTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens ?? 0,
            },
          };
          return;
        }
      }
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) {
        yield {
          type: 'error',
          error: 'Rate limit exceeded',
          retryable: true,
        };
      } else if (error instanceof OpenAI.AuthenticationError) {
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
    request: LlmRequest,
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
    ];
    for (const m of request.messages) {
      messages.push({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content
                .map((b) =>
                  b.type === 'text' ? b.text : JSON.stringify(b),
                )
                .join('\n'),
      } as OpenAI.ChatCompletionMessageParam);
    }
    return messages;
  }

  translateTools(
    tools: ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}
