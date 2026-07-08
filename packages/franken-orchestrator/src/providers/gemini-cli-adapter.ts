import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  lstatSync,
  mkdtempSync,
  readlinkSync,
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
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { formatHandoff } from './format-handoff.js';
import { collectCliOutput, extractAuthFields, isCliAvailable } from './discover-skills-helpers.js';
import { tryExtractTextFromNode } from '../skills/providers/stream-json-utils.js';

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
    const settingsWorkingDir = resolve(mkdtempSync(join(tmpdir(), 'franken-gemini-settings-')));

    try {
      this.removeManagedGeminiMd();
      const { settingsPath, contextFileName } = this.writeContextSettings(settingsWorkingDir, contextWorkingDir);
      this.writeGeminiMd(request.systemPrompt, undefined, contextWorkingDir, contextFileName);
      const args = this.buildArgs(request);
      const proc = spawn(this.binaryPath, args, {
        cwd: workspaceDir,
        env: { ...process.env, GEMINI_CLI_SYSTEM_SETTINGS_PATH: settingsPath },
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
      rmSync(settingsWorkingDir, { recursive: true, force: true });
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

  buildArgs(_request: LlmRequest): string[] {
    const args = ['-p', '', '--output-format', 'stream-json'];
    if (this.options.model) {
      args.push('-m', this.options.model);
    }
    if (this.options.extraArgs?.length) {
      args.push(...this.safeExtraArgs());
    }
    return args;
  }

  private safeExtraArgs(): string[] {
    const result: string[] = [];
    for (let index = 0; index < this.options.extraArgs!.length; index += 1) {
      const arg = this.options.extraArgs![index]!;
      if (arg === '--include-directories') {
        index += 1;
        continue;
      }
      if (arg.startsWith('--include-directories=')) continue;
      result.push(arg);
    }
    return result;
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

  private writeContextSettings(targetDir: string, includeDir: string): { settingsPath: string; contextFileName: string } {
    const existingPath = process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH ?? this.defaultSystemSettingsPath();
    let existing: Record<string, unknown> = {};
    if (existsSync(existingPath)) {
      try {
        existing = JSON.parse(this.stripJsonComments(readFileSync(existingPath, 'utf-8'))) as Record<string, unknown>;
      } catch {
        throw new Error(`Unable to parse Gemini system settings at ${existingPath}`);
      }
    }

    const existingContext = this.asObject(existing['context']) ?? {};
    const contextFileName = this.firstContextFileName(existingContext['fileName']) ?? 'GEMINI.md';
    const includeDirectories = this.uniqueStrings([
      ...this.stringArray(existingContext['includeDirectories']),
      ...this.extraIncludeDirectories(),
      includeDir,
    ]);
    const settingsPath = join(targetDir, 'settings.json');
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          ...existing,
          context: {
            ...existingContext,
            includeDirectories,
            loadMemoryFromIncludeDirectories: true,
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    return { settingsPath, contextFileName };
  }

  private firstContextFileName(value: unknown): string | undefined {
    if (typeof value === 'string' && value) return value;
    if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string' && item.length > 0);
    return undefined;
  }

  private extraIncludeDirectories(): string[] {
    const args = this.options.extraArgs ?? [];
    const dirs: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index]!;
      if (arg === '--include-directories') {
        const next = args[index + 1];
        if (next) dirs.push(next);
        index += 1;
      } else if (arg.startsWith('--include-directories=')) {
        dirs.push(arg.slice('--include-directories='.length));
      }
    }
    return dirs;
  }

  private stringArray(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return [];
  }

  private uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  private defaultSystemSettingsPath(): string {
    if (platform() === 'darwin') return '/Library/Application Support/GeminiCli/settings.json';
    if (platform() === 'win32') return join(process.env['ProgramData'] ?? 'C:\\ProgramData', 'gemini-cli', 'settings.json');
    return '/etc/gemini-cli/settings.json';
  }

  private stripJsonComments(value: string): string {
    let output = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < value.length; i += 1) {
      const current = value[i]!;
      const next = value[i + 1];

      if (inString) {
        output += current;
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '"') {
          inString = false;
        }
        continue;
      }

      if (current === '"') {
        inString = true;
        output += current;
        continue;
      }

      if (current === '/' && next === '/') {
        while (i < value.length && value[i] !== '\n') i += 1;
        output += '\n';
        continue;
      }

      if (current === '/' && next === '*') {
        i += 2;
        while (i < value.length && !(value[i] === '*' && value[i + 1] === '/')) i += 1;
        i += 1;
        continue;
      }

      output += current;
    }

    return output;
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
    const writePath = this.isSymlink(path) ? this.resolveSymlinkTarget(path) : path;
    const tmpPath = `${writePath}.${process.pid}.${Date.now()}.tmp`;
    const existingMode = existsSync(writePath) ? statSync(writePath).mode : undefined;
    writeFileSync(tmpPath, content);
    if (existingMode !== undefined) {
      chmodSync(tmpPath, existingMode);
    }
    renameSync(tmpPath, writePath);
  }

  private resolveSymlinkTarget(path: string): string {
    try {
      return realpathSync(path);
    } catch {
      const target = readlinkSync(path);
      return isAbsolute(target) ? target : resolve(dirname(path), target);
    }
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
    let emittedText = false;
    let emittedToolUse = false;
    let sawTerminalFrame = false;

    for await (const line of rl) {
      if (!line.trim()) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = parsed['type'] as string;

      if (type === 'result') {
        const parts: string[] = [];
        tryExtractTextFromNode(parsed['result'] ?? parsed, parts);
        const text = parts.join('');
        const error = parsed['error'] as Record<string, unknown> | string | undefined;
        const errorText = typeof error === 'string' ? error : ((error?.['message'] as string | undefined) ?? '');
        const isErrorResult = parsed['is_error'] === true || parsed['subtype'] === 'error' || parsed['status'] === 'error';
        if (isErrorResult) {
          const message = text || errorText || 'gemini returned an error result frame';
          yield {
            type: 'error',
            error: message,
            retryable: message.includes('rate') || message.includes('RESOURCE_EXHAUSTED'),
          };
          return;
        }
        if (text.length > 0 && !emittedText) {
          yield { type: 'text', content: text };
          emittedText = true;
        }
        const usage = (parsed['usage'] ?? parsed['stats']) as Record<string, number> | undefined;
        if (usage) {
          totalInputTokens =
            usage['input_tokens'] ??
            usage['inputTokens'] ??
            usage['prompt_tokens'] ??
            usage['promptTokenCount'] ??
            usage['totalInputTokens'] ??
            totalInputTokens;
          totalOutputTokens =
            usage['output_tokens'] ??
            usage['outputTokens'] ??
            usage['completion_tokens'] ??
            usage['candidatesTokenCount'] ??
            usage['totalOutputTokens'] ??
            totalOutputTokens;
        }
        if (!emittedText && !emittedToolUse) {
          yield {
            type: 'error',
            error: 'gemini result frame contained no text output',
            retryable: false,
          };
          return;
        }
        sawTerminalFrame = true;

        yield {
          type: 'done',
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,

          },
        };
        return;
      } else if (type === 'content_block_delta') {
        const delta = parsed['delta'] as Record<string, unknown>;
        if (delta?.['type'] === 'text_delta') {
          yield { type: 'text', content: delta['text'] as string };
          emittedText = true;
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
          emittedToolUse = true;
        }
      } else if (type === 'tool_use') {
        yield {
          type: 'tool_use',
          id: (parsed['tool_id'] as string) ?? (parsed['id'] as string) ?? crypto.randomUUID(),
          name: (parsed['tool_name'] as string) ?? (parsed['name'] as string),
          input: parsed['parameters'] ?? parsed['input'] ?? {},
        };
        emittedToolUse = true;
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
      } else if (type === 'message') {
        const message = parsed['message'] as Record<string, unknown> | undefined;
        const role = (message?.['role'] ?? parsed['role']) as string | undefined;
        if (role === 'assistant') {
          const content = message?.['content'] ?? parsed['content'] ?? parsed['parts'];
          if (Array.isArray(content)) {
            const parts = content
              .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>)['text'] : part))
              .filter((part): part is string => typeof part === 'string');
            const text = parts.join('');
            if (text.length > 0) {
              yield { type: 'text', content: text };
              emittedText = true;
            }
          } else if (typeof content === 'string') {
            if (content.length > 0) {
              yield { type: 'text', content };
              emittedText = true;
            }
          } else {
            const parts: string[] = [];
            tryExtractTextFromNode(parsed, parts);
            const text = parts.join('');
            if (text.length > 0) {
              yield { type: 'text', content: text };
              emittedText = true;
            }
          }
        }
      } else if (type === 'message_stop') {
        sawTerminalFrame = true;
        if (!emittedText && !emittedToolUse) {
          yield {
            type: 'error',
            error: 'gemini stream completed without parseable text',
            retryable: true,
          };
          return;
        }
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
      } else if (type === 'tool_result') {
        continue;
      } else if (!emittedText) {
        const parts: string[] = [];
        tryExtractTextFromNode(parsed, parts);
        const text = parts.join('').trim();
        if (text.length > 0) {
          yield { type: 'text', content: text };
          emittedText = true;
        }
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
    } else if (sawTerminalFrame && (emittedText || emittedToolUse)) {
      yield {
        type: 'done',
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
      };
    } else {
      yield {
        type: 'error',
        error: 'gemini process exited without producing a result frame or text output',
        retryable: false,
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
