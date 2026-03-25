import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
import { homedir } from 'node:os';
import { join } from 'node:path';
import { formatHandoff } from './format-handoff.js';
import { collectCliOutput, extractAuthFields } from './discover-skills-helpers.js';

const MANAGED_START = '<!-- FRANKENBEAST MANAGED SECTION - DO NOT EDIT -->';
const MANAGED_END = '<!-- END FRANKENBEAST SECTION -->';

export interface GeminiCliOptions {
  binaryPath?: string;
  model?: string;
  workingDir?: string;
}

export class GeminiCliAdapter implements ILlmProvider {
  readonly name = 'gemini-cli';
  readonly type: ProviderType = 'gemini-cli';
  readonly authMethod: ProviderAuthMethod = 'cli-login';
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    vision: true,
    maxContextTokens: 1_000_000,
    mcpSupport: true,
    skillDiscovery: true,
  };

  constructor(private options: GeminiCliOptions = {}) {}

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
    this.writeGeminiMd(request.systemPrompt);

    const args = this.buildArgs(request);
    const proc = spawn(this.binaryPath, args, {
      cwd: this.workingDir,
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
      const { stdout, exitCode } = await collectCliOutput(
        this.binaryPath,
        ['tool', 'list', '--json'],
        { ...process.env } as Record<string, string>,
      );
      if (exitCode !== 0 || !stdout.trim()) {
        return this.discoverFromSettingsFile();
      }

      const tools = JSON.parse(stdout);
      if (!Array.isArray(tools)) return [];

      return tools
        .filter((t: Record<string, unknown>) => t['type'] === 'mcp' || t['mcpServer'])
        .map((t: Record<string, unknown>) => ({
          name: (t['name'] as string) ?? 'unknown',
          description: (t['description'] as string) ?? '',
          provider: 'gemini-cli',
          installConfig: {
            command: (t['command'] as string) ?? 'npx',
            args: (t['args'] as string[]) ?? [],
            env: (t['env'] as Record<string, string>) ?? {},
          },
          authFields: extractAuthFields(t['env'] as Record<string, string>),
          toolDefinitions: (t['tools'] as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>) ?? [],
        }));
    } catch {
      return [];
    }
  }

  private async discoverFromSettingsFile(): Promise<SkillCatalogEntry[]> {
    try {
      const settingsPath = join(homedir(), '.gemini', 'settings.json');
      if (!existsSync(settingsPath)) return [];
      const raw = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = (settings['mcpServers'] as Record<string, Record<string, unknown>>) ?? {};

      return Object.entries(mcpServers).map(([name, config]) => ({
        name,
        description: (config['description'] as string) ?? '',
        provider: 'gemini-cli',
        installConfig: {
          command: (config['command'] as string) ?? 'npx',
          args: (config['args'] as string[]) ?? [],
          env: (config['env'] as Record<string, string>) ?? {},
        },
        authFields: extractAuthFields(config['env'] as Record<string, string>),
      }));
    } catch {
      return [];
    }
  }

  private get binaryPath(): string {
    return this.options.binaryPath ?? 'gemini';
  }

  private get workingDir(): string {
    return this.options.workingDir ?? process.cwd();
  }

  buildArgs(_request: LlmRequest): string[] {
    const args = ['-p', '--output-format', 'stream-json'];
    if (this.options.model) {
      args.push('-m', this.options.model);
    }
    return args;
  }

  writeGeminiMd(systemPrompt: string, handoffContext?: string): void {
    const geminiMdPath = `${this.workingDir}/GEMINI.md`;
    const managedContent = [
      MANAGED_START,
      systemPrompt,
      ...(handoffContext ? ['', handoffContext] : []),
      MANAGED_END,
    ].join('\n');

    if (existsSync(geminiMdPath)) {
      let existing = readFileSync(geminiMdPath, 'utf-8');
      const startIdx = existing.indexOf(MANAGED_START);
      const endIdx = existing.indexOf(MANAGED_END);
      if (startIdx !== -1 && endIdx !== -1) {
        existing =
          existing.slice(0, startIdx) +
          managedContent +
          existing.slice(endIdx + MANAGED_END.length);
      } else {
        existing = managedContent + '\n\n' + existing;
      }
      writeFileSync(geminiMdPath, existing);
    } else {
      writeFileSync(geminiMdPath, managedContent);
    }
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

      if (type === 'content_block_delta') {
        const delta = parsed['delta'] as Record<string, unknown>;
        if (delta?.['type'] === 'text_delta') {
          yield { type: 'text', content: delta['text'] as string };
        }
      } else if (type === 'content_block_start') {
        const block = parsed['content_block'] as Record<string, unknown>;
        if (block?.['type'] === 'tool_use') {
          yield {
            type: 'tool_use',
            id: (block['id'] as string) ?? crypto.randomUUID(),
            name: block['name'] as string,
            input: block['input'] ?? {},
          };
        }
      } else if (type === 'message_delta') {
        const usage = parsed['usage'] as Record<string, number> | undefined;
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
        const message = (parsed['message'] as string) ?? 'Unknown error';
        yield {
          type: 'error',
          error: message,
          retryable: message.includes('rate') || message.includes('RESOURCE_EXHAUSTED'),
        };
        return;
      }
    }

    // Stream ended without message_stop/error — check exit code
    const exitCode = await new Promise<number | null>((resolve) => {
      proc.on('close', resolve);
    });
    if (exitCode !== 0 && exitCode !== null) {
      yield {
        type: 'error',
        error: `gemini process exited with code ${exitCode}`,
        retryable: false,
      };
    } else {
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
}
