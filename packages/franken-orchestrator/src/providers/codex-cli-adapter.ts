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
  SkillCatalogEntry,
} from '@franken/types';
import { formatHandoff } from './format-handoff.js';

export interface CodexCliOptions {
  binaryPath?: string;
  profile?: string;
  configOverrides?: Record<string, string>;
}

export class CodexCliAdapter implements ILlmProvider {
  readonly name = 'codex-cli';
  readonly type: ProviderType = 'codex-cli';
  readonly authMethod: ProviderAuthMethod = 'cli-login';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: false,
    maxContextTokens: 128_000,
    mcpSupport: true,
    skillDiscovery: true,
  };

  constructor(private options: CodexCliOptions = {}) {}

  async isAvailable(): Promise<boolean> {
    try {
      const proc = spawn(this.binaryPath, ['--version'], { timeout: 5000 });
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

  async discoverSkills(): Promise<SkillCatalogEntry[]> {
    try {
      const proc = spawn(this.binaryPath, ['mcp', 'list', '--json'], {
        timeout: 10_000,
      });
      const chunks: string[] = [];
      proc.stdout!.on('data', (chunk: Buffer) =>
        chunks.push(chunk.toString()),
      );
      await new Promise<void>((resolve) => proc.on('close', resolve));
      const output = chunks.join('');
      if (!output.trim()) return [];
      const servers = JSON.parse(output) as Array<{
        name: string;
        description?: string;
      }>;
      return servers.map((s) => ({
        name: s.name,
        description: s.description ?? '',
        provider: 'codex-cli',
        installConfig: { command: 'codex', args: ['mcp', 'add', s.name] },
        authFields: [],
      }));
    } catch {
      return [];
    }
  }

  private get binaryPath(): string {
    return this.options.binaryPath ?? 'codex';
  }

  buildArgs(request: LlmRequest): string[] {
    const args = ['exec', '--json', '--ephemeral'];
    if (request.systemPrompt) {
      args.push('-c', `instructions=${request.systemPrompt}`);
    }
    if (this.options.profile) {
      args.push('-p', this.options.profile);
    }
    if (this.options.configOverrides) {
      for (const [key, value] of Object.entries(
        this.options.configOverrides,
      )) {
        args.push('-c', `${key}=${value}`);
      }
    }
    return args;
  }

  private async *parseStream(
    proc: ChildProcess,
  ): AsyncGenerator<LlmStreamEvent> {
    const rl = createInterface({ input: proc.stdout! });
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

      if (type === 'message' || type === 'content') {
        const content = parsed['content'] as string | undefined;
        if (content) {
          yield { type: 'text', content };
        }
      } else if (type === 'function_call' || type === 'tool_call') {
        yield {
          type: 'tool_use',
          id: (parsed['id'] as string) ?? crypto.randomUUID(),
          name: parsed['name'] as string,
          input: parsed['arguments'] ?? parsed['input'] ?? {},
        };
      } else if (type === 'usage' || type === 'done') {
        const usage = (parsed['usage'] as Record<string, number>) ?? parsed;
        totalInputTokens =
          (usage['input_tokens'] as number) ?? totalInputTokens;
        totalOutputTokens =
          (usage['output_tokens'] as number) ?? totalOutputTokens;
        if (type === 'done') {
          yield {
            type: 'done',
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              totalTokens: totalInputTokens + totalOutputTokens,
            },
          };
          return;
        }
      } else if (type === 'error') {
        const message =
          (parsed['message'] as string) ?? 'Unknown error';
        const retryable =
          message.includes('rate') || message.includes('429');
        yield { type: 'error', error: message, retryable };
        return;
      }
    }

    // Stream ended — emit done if we didn't already
    yield {
      type: 'done',
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
    };
  }
}
