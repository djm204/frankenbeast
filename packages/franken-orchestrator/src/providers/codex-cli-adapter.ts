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
import { deterministicUuid } from '@franken/types';
import { formatHandoff } from './format-handoff.js';
import { collectCliOutput, extractAuthFields, isCliAvailable } from './discover-skills-helpers.js';

function terminateRunningProcess(proc: ChildProcess): void {
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill();
  }
}

export interface CodexCliOptions {
  binaryPath?: string;
  model?: string;
  profile?: string;
  configOverrides?: Record<string, string>;
  extraArgs?: readonly string[];
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
    return isCliAvailable(this.binaryPath);
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const args = this.buildArgs(request);
    const proc = spawn(this.binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const spawnState: { message: string | undefined } = { message: undefined };
    proc.once('error', (error) => {
      spawnState.message = error.message;
    });

    const userContent = request.messages
      .map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      )
      .join('\n');
    proc.stdin!.write(userContent);
    proc.stdin!.end();

    yield* this.parseStream(proc, spawnState);
  }

  formatHandoff(snapshot: BrainSnapshot): string {
    return formatHandoff(snapshot);
  }

  async discoverSkills(): Promise<SkillCatalogEntry[]> {
    try {
      const { stdout, exitCode } = await collectCliOutput(
        this.binaryPath,
        ['mcp', 'list', '--json'],
        { ...process.env } as Record<string, string>,
      );
      if (exitCode !== 0 || !stdout.trim()) return [];

      const servers = JSON.parse(stdout);
      if (!Array.isArray(servers)) return [];

      return servers.map((s: Record<string, unknown>) => ({
        name: (s['name'] as string) ?? 'unknown',
        description: (s['description'] as string) ?? '',
        provider: 'codex-cli',
        installConfig: {
          command: (s['command'] as string) ?? 'codex',
          args: (s['args'] as string[]) ?? ['mcp', 'add', (s['name'] as string) ?? ''],
          env: (s['env'] as Record<string, string>) ?? {},
        },
        authFields: extractAuthFields(s['env'] as Record<string, string>),
        toolDefinitions: (s['toolDefinitions'] as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>) ?? [],
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
    if (this.options.model && !this.options.configOverrides?.['model']) {
      args.push('-c', `model=${this.options.model}`);
    }
    if (this.options.configOverrides) {
      for (const [key, value] of Object.entries(
        this.options.configOverrides,
      )) {
        args.push('-c', `${key}=${value}`);
      }
    }
    if (this.options.extraArgs?.length) {
      args.push(...this.options.extraArgs);
    }
    return args;
  }

  private async *parseStream(
    proc: ChildProcess,
    spawnState: { message: string | undefined },
  ): AsyncGenerator<LlmStreamEvent> {
    const rl = createInterface({ input: proc.stdout! });
    proc.once('error', () => {
      if (!rl.closed) {
        rl.close();
      }
    });
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let streamCompleted = false;

    try {
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
            id: (parsed['id'] as string) ?? deterministicUuid('packages/franken-orchestrator/src/providers/codex-cli-adapter.ts'),
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
            streamCompleted = true;
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

      // Stream ended without a done/error frame — check spawn/exit status
      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on('close', resolve);
      });
      if (spawnState.message) {
        streamCompleted = true;
        yield {
          type: 'error',
          error: `codex process failed to start: ${spawnState.message}`,
          retryable: false,
        };
        return;
      }
      if (exitCode !== 0 && exitCode !== null) {
        yield {
          type: 'error',
          error: `codex process exited with code ${exitCode}`,
          retryable: false,
        };
      } else {
        streamCompleted = true;
        yield {
          type: 'done',
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
          },
        };
      }
    } finally {
      rl.close();
      if (!streamCompleted) {
        terminateRunningProcess(proc);
      }
    }
  }
}
