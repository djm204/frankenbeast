import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  ILlmProvider,
  LlmRequest,
  LlmStreamEvent,
  ProviderCapabilities,
  ProviderType,
  ProviderAuthMethod,
  BrainSnapshot,
} from '@franken/types';
import { formatHandoff } from './format-handoff.js';

export interface ClaudeCliOptions {
  binaryPath?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  tools?: string[];
}

export class ClaudeCliAdapter implements ILlmProvider {
  readonly name = 'claude-cli';
  readonly type: ProviderType = 'claude-cli';
  readonly authMethod: ProviderAuthMethod = 'cli-login';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 200_000,
    mcpSupport: true,
    skillDiscovery: true,
  };

  constructor(private options: ClaudeCliOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    try {
      const proc = spawn(this.binaryPath, ['--version'], {
        env: this.sanitizedEnv(),
        timeout: 5000,
      });
      return new Promise((resolve) => {
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const args = this.buildArgs(request);
    const proc = spawn(this.binaryPath, args, {
      env: this.sanitizedEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const userContent = request.messages
      .map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      )
      .join('\n');
    proc.stdin!.write(userContent);
    proc.stdin!.end();

    yield* this.parseStream(proc);
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    return formatHandoff(snapshot);
  }

  private get binaryPath(): string {
    return this.options.binaryPath ?? 'claude';
  }

  buildArgs(request: LlmRequest): string[] {
    const args = ['-p', '--output-format', 'stream-json'];
    if (request.systemPrompt) {
      args.push('--append-system-prompt', request.systemPrompt);
    }
    if (this.options.maxBudgetUsd) {
      args.push('--max-budget-usd', String(this.options.maxBudgetUsd));
    }
    if (this.options.maxTurns) {
      args.push('--max-turns', String(this.options.maxTurns));
    }
    if (this.options.tools?.length) {
      args.push('--tools', this.options.tools.join(','));
    }
    return args;
  }

  sanitizedEnv(): Record<string, string> {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('CLAUDE')) {
        delete env[key];
      }
    }
    env['FRANKENBEAST_SPAWNED'] = '1';
    return env as Record<string, string>;
  }

  private async *parseStream(
    proc: ChildProcess,
  ): AsyncGenerator<LlmStreamEvent> {
    const rl = createInterface({ input: proc.stdout! });
    let currentToolUse: { id: string; name: string; inputJson: string } | null =
      null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = parsed['type'] as string;

      if (type === 'content_block_start') {
        const block = parsed['content_block'] as Record<string, unknown>;
        if (block?.['type'] === 'tool_use') {
          currentToolUse = {
            id: block['id'] as string,
            name: block['name'] as string,
            inputJson: '',
          };
        }
      } else if (type === 'content_block_delta') {
        const delta = parsed['delta'] as Record<string, unknown>;
        if (delta?.['type'] === 'text_delta') {
          yield { type: 'text', content: delta['text'] as string };
        } else if (
          delta?.['type'] === 'input_json_delta' &&
          currentToolUse
        ) {
          currentToolUse.inputJson += delta['partial_json'] as string;
        }
      } else if (type === 'content_block_stop') {
        if (currentToolUse) {
          let input: unknown = {};
          try {
            input = JSON.parse(currentToolUse.inputJson);
          } catch {
            /* empty input */
          }
          yield {
            type: 'tool_use',
            id: currentToolUse.id,
            name: currentToolUse.name,
            input,
          };
          currentToolUse = null;
        }
      } else if (type === 'message_delta') {
        const usage = parsed['usage'] as
          | Record<string, number>
          | undefined;
        if (usage) {
          totalOutputTokens = usage['output_tokens'] ?? totalOutputTokens;
        }
      } else if (type === 'message_start') {
        const message = parsed['message'] as Record<string, unknown> | undefined;
        const usage = message?.['usage'] as Record<string, number> | undefined;
        if (usage) {
          totalInputTokens = usage['input_tokens'] ?? 0;
        }
      } else if (type === 'message_stop') {
        yield {
          type: 'done',
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
          },
        };
        return;
      } else if (type === 'error') {
        const error = parsed['error'] as Record<string, unknown> | undefined;
        const message =
          (error?.['message'] as string) ?? 'Unknown error';
        const retryable =
          message.includes('rate') || message.includes('overloaded');
        yield { type: 'error', error: message, retryable };
        return;
      }
    }

    // If process exited without message_stop, check exit code
    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', resolve);
    });
    if (exitCode !== 0) {
      yield {
        type: 'error',
        error: `claude process exited with code ${exitCode}`,
        retryable: false,
      };
    }
  }
}
