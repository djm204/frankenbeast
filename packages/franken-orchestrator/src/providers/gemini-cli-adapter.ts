import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
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
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatHandoff } from './format-handoff.js';
import { collectCliOutput, extractAuthFields, isCliAvailable } from './discover-skills-helpers.js';

const MANAGED_START = '<!-- FRANKENBEAST MANAGED SECTION - DO NOT EDIT -->';
const MANAGED_END = '<!-- END FRANKENBEAST SECTION -->';

export interface GeminiCliOptions {
  binaryPath?: string;
  model?: string;
  workingDir?: string;
  extraArgs?: readonly string[];
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
    return isCliAvailable(this.binaryPath);
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const workspaceDir = resolve(this.workingDir);
    const contextWorkingDir = resolve(mkdtempSync(join(tmpdir(), 'franken-gemini-context-')));

    try {
      this.removeManagedGeminiMd();
      this.writeGeminiMd(request.systemPrompt, undefined, contextWorkingDir);
      const args = this.buildArgs(request, contextWorkingDir);
      const proc = spawn(this.binaryPath, args, {
        cwd: workspaceDir,
        env: { ...process.env },
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
    } finally {
      rmSync(contextWorkingDir, { recursive: true, force: true });
    }
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

  buildArgs(_request: LlmRequest, includeDirectory?: string): string[] {
    const args = ['-p', '', '--output-format', 'stream-json'];
    if (includeDirectory) {
      args.push('--include-directories', includeDirectory);
    }
    if (this.options.model) {
      args.push('-m', this.options.model);
    }
    if (this.options.extraArgs?.length) {
      args.push(...this.options.extraArgs);
    }
    return args;
  }

  writeGeminiMd(
    systemPrompt: string,
    handoffContext?: string,
    targetDir = this.workingDir,
    fileName = 'GEMINI.md',
  ): void {
    const geminiMdPath = join(targetDir, fileName);
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
      this.writeFileAtomically(geminiMdPath, existing);
    } else {
      this.writeFileAtomically(geminiMdPath, managedContent);
    }
  }

  private removeManagedGeminiMd(targetDir = this.workingDir): void {
    const geminiMdPath = join(targetDir, 'GEMINI.md');
    if (!existsSync(geminiMdPath)) return;

    const existing = readFileSync(geminiMdPath, 'utf-8');
    const startIdx = existing.indexOf(MANAGED_START);
    const endIdx = existing.indexOf(MANAGED_END);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return;

    const before = existing.slice(0, startIdx);
    let after = existing.slice(endIdx + MANAGED_END.length);
    if (before.endsWith('\n') && after.startsWith('\n')) {
      after = after.slice(1);
    }
    const next = before + after;
    if (next) {
      this.writeFileAtomically(geminiMdPath, next);
    } else if (this.isSymlink(geminiMdPath)) {
      this.writeFileAtomically(geminiMdPath, '');
    } else {
      unlinkSync(geminiMdPath);
    }
  }

  private writeFileAtomically(path: string, content: string): void {
    const writePath = existsSync(path) && this.isSymlink(path) ? realpathSync(path) : path;
    const tmpPath = `${writePath}.${process.pid}.${Date.now()}.tmp`;
    const existingMode = existsSync(writePath) ? statSync(writePath).mode : undefined;
    writeFileSync(tmpPath, content);
    if (existingMode !== undefined) {
      chmodSync(tmpPath, existingMode);
    }
    renameSync(tmpPath, writePath);
  }

  private isSymlink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
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

      if (type === 'message') {
        if (!this.isAssistantGeminiMessage(parsed)) continue;
        for (const text of this.extractGeminiText(parsed)) {
          yield { type: 'text', content: text };
        }
      } else if (type === 'tool_use') {
        yield {
          type: 'tool_use',
          id: (parsed['tool_id'] as string) ?? (parsed['id'] as string) ?? crypto.randomUUID(),
          name: (parsed['tool_name'] as string) ?? (parsed['name'] as string) ?? '',
          input: parsed['parameters'] ?? parsed['input'] ?? parsed['args'] ?? {},
        };
      } else if (type === 'tool_result') {
        yield {
          type: 'tool_result',
          toolUseId: (parsed['tool_id'] as string) ?? (parsed['toolUseId'] as string) ?? (parsed['tool_use_id'] as string) ?? (parsed['id'] as string) ?? '',
          content: this.stringifyGeminiContent(parsed['content'] ?? parsed['result'] ?? ''),
          isError: Boolean(parsed['isError'] ?? parsed['is_error']),
        };
      } else if (type === 'result') {
        if (parsed['status'] === 'error' || parsed['error']) {
          const message = this.stringifyGeminiContent(parsed['error'] ?? parsed['message'] ?? 'Gemini CLI returned error status');
          yield { type: 'error', error: message, retryable: message.includes('rate') || message.includes('RESOURCE_EXHAUSTED') };
          return;
        }
        const usage = this.extractGeminiUsage(parsed);
        totalInputTokens = usage.inputTokens ?? totalInputTokens;
        totalOutputTokens = usage.outputTokens ?? totalOutputTokens;
        yield {
          type: 'done',
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: usage.totalTokens ?? totalInputTokens + totalOutputTokens,
          },
        };
        return;
      } else if (type === 'content_block_delta') {
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
        const message = this.stringifyGeminiContent(parsed['message'] ?? parsed['error'] ?? 'Unknown error');
        yield {
          type: 'error',
          error: message,
          retryable: message.includes('rate') || message.includes('RESOURCE_EXHAUSTED'),
        };
        return;
      }
    }

    // Stream ended without message_stop/result/error — check exit code
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

  private extractGeminiText(event: Record<string, unknown>): string[] {
    const message = this.asObject(event['message']) ?? event;
    return this.extractTextParts(message['content'] ?? message['text']);
  }

  private isAssistantGeminiMessage(event: Record<string, unknown>): boolean {
    const message = this.asObject(event['message']) ?? event;
    const role = message['role'] ?? event['role'];
    return role === undefined || role === 'assistant' || role === 'model';
  }

  private extractTextParts(value: unknown): string[] {
    if (typeof value === 'string') return value ? [value] : [];
    if (Array.isArray(value)) return value.flatMap((part) => this.extractTextParts(part));
    const objectValue = this.asObject(value);
    if (!objectValue) return [];
    if (objectValue['type'] === 'text' && typeof objectValue['text'] === 'string') {
      return [objectValue['text']];
    }
    return this.extractTextParts(objectValue['content'] ?? objectValue['parts'] ?? objectValue['text']);
  }

  private extractGeminiUsage(event: Record<string, unknown>): Partial<{ inputTokens: number; outputTokens: number; totalTokens: number }> {
    const usage = this.asObject(event['usage']) ?? this.asObject(event['usageMetadata']) ?? this.asObject(event['usage_metadata']) ?? this.asObject(event['stats']) ?? event;
    const inputTokens = this.numberValue(usage['inputTokens'], usage['input_tokens'], usage['promptTokenCount'], usage['prompt_token_count']);
    const outputTokens = this.numberValue(usage['outputTokens'], usage['output_tokens'], usage['candidatesTokenCount'], usage['candidates_token_count']);
    const totalTokens = this.numberValue(usage['totalTokens'], usage['total_tokens'], usage['totalTokenCount'], usage['total_token_count']);
    return {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
    };
  }

  private numberValue(...values: unknown[]): number | undefined {
    return values.find((value): value is number => typeof value === 'number');
  }

  private stringifyGeminiContent(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
