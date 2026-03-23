import { GoogleGenAI } from '@google/genai';
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

export interface GeminiApiOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class GeminiApiAdapter implements ILlmProvider {
  readonly name = 'gemini-api';
  readonly type: ProviderType = 'gemini-api';
  readonly authMethod: ProviderAuthMethod = 'api-key';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 1_000_000,
    mcpSupport: false,
    skillDiscovery: false,
  };

  private client: GoogleGenAI;

  constructor(private options: GeminiApiOptions = {}) {
    const apiKey =
      options.apiKey ??
      process.env['GOOGLE_API_KEY'] ??
      process.env['GEMINI_API_KEY'] ??
      '';
    this.client = new GoogleGenAI({ apiKey });
  }

  async isAvailable(): Promise<boolean> {
    return !!(
      this.options.apiKey ||
      process.env['GOOGLE_API_KEY'] ||
      process.env['GEMINI_API_KEY']
    );
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const model = this.options.model ?? 'gemini-2.5-flash';

    try {
      const config: Record<string, unknown> = {
        systemInstruction: request.systemPrompt,
        maxOutputTokens:
          request.maxTokens ?? this.options.maxTokens ?? 4096,
      };
      if (request.tools) {
        config['tools'] = [
          { functionDeclarations: this.translateTools(request.tools) },
        ];
      }
      if (request.temperature !== undefined) {
        config['temperature'] = request.temperature;
      }
      const response = await this.client.models.generateContentStream({
        model,
        contents: this.translateMessages(request.messages),
        config,
      });

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      for await (const chunk of response) {
        if (chunk.text) {
          yield { type: 'text', content: chunk.text };
        }

        if (chunk.functionCalls) {
          for (const call of chunk.functionCalls) {
            yield {
              type: 'tool_use',
              id: (call as { id?: string }).id ?? crypto.randomUUID(),
              name: call.name ?? '',
              input: call.args ?? {},
            };
          }
        }

        if (chunk.usageMetadata) {
          totalInputTokens =
            chunk.usageMetadata.promptTokenCount ?? 0;
          totalOutputTokens =
            chunk.usageMetadata.candidatesTokenCount ?? 0;
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
      const message =
        error instanceof Error ? error.message : String(error);
      const retryable =
        message.includes('429') ||
        message.includes('RESOURCE_EXHAUSTED');
      yield { type: 'error', error: message, retryable };
    }
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    return formatHandoff(snapshot);
  }

  translateMessages(
    messages: LlmMessage[],
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [
        {
          text:
            typeof m.content === 'string'
              ? m.content
              : m.content
                  .map((b) =>
                    b.type === 'text' ? b.text : JSON.stringify(b),
                  )
                  .join('\n'),
        },
      ],
    }));
  }

  translateTools(
    tools: ToolDefinition[],
  ): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));
  }
}
