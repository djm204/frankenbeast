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
import { tryExtractTextFromNode } from '../skills/providers/stream-json-utils.js';
import { RUNTIME_CONFIG_MANIFEST_KEY_ENV } from '../beasts/execution/runtime-config-integrity.js';

function scrubRuntimeConfigManifestKey(env: Record<string, string>): Record<string, string> {
  delete env[RUNTIME_CONFIG_MANIFEST_KEY_ENV];
  return env;
}

function terminateRunningProcess(proc: ChildProcess): void {
  if (proc.exitCode === null && proc.signalCode === null) {
    proc.kill();
  }
}

export interface ClaudeCliOptions {
  binaryPath?: string;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  tools?: string[];
  extraArgs?: readonly string[];
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
    return isCliAvailable(this.binaryPath, this.sanitizedEnv());
  }

  async *execute(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const args = this.buildArgs(request);
    const proc = spawn(this.binaryPath, args, {
      env: this.sanitizedEnv(),
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
        this.sanitizedEnv(),
      );
      if (exitCode !== 0 || !stdout.trim()) return [];

      const servers = JSON.parse(stdout);
      if (!Array.isArray(servers)) return [];

      return servers.map((s: Record<string, unknown>) => ({
        name: (s['name'] as string) ?? 'unknown',
        description: (s['description'] as string) ?? '',
        provider: 'claude-cli',
        installConfig: {
          command: (s['command'] as string) ?? 'npx',
          args: (s['args'] as string[]) ?? [],
          env: (s['env'] as Record<string, string>) ?? {},
        },
        authFields: extractAuthFields(s['env'] as Record<string, string>),
        toolDefinitions: (s['tools'] as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>) ?? [],
      }));
    } catch {
      return [];
    }
  }

  private get binaryPath(): string {
    return this.options.binaryPath ?? 'claude';
  }

  buildArgs(request: LlmRequest): string[] {
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (request.systemPrompt) {
      args.push('--append-system-prompt', request.systemPrompt);
    }
    if (this.options.model) {
      args.push('--model', this.options.model);
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
    if (this.options.extraArgs?.length) {
      args.push(...this.options.extraArgs);
    }
    return args;
  }

  sanitizedEnv(): Record<string, string> {
    const env = scrubRuntimeConfigManifestKey({ ...process.env } as Record<string, string>);
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
    spawnState: { message: string | undefined },
  ): AsyncGenerator<LlmStreamEvent> {
    const rl = createInterface({ input: proc.stdout! });
    proc.once('error', () => {
      rl.close();
    });
    let currentToolUse: { id: string; name: string; inputJson: string } | null =
      null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let emittedText = false;
    let emittedToolUse = false;
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

        if (type === 'result') {
          const resultText = typeof parsed['result'] === 'string' ? parsed['result'] : '';
          const errorText =
            typeof parsed['error'] === 'string'
              ? parsed['error']
              : ((parsed['error'] as Record<string, unknown> | undefined)?.['message'] as string | undefined) ?? '';
          const errors = Array.isArray(parsed['errors']) ? parsed['errors'].filter((value): value is string => typeof value === 'string') : [];
          const subtype = parsed['subtype'] as string | undefined;
          const isErrorResult = parsed['is_error'] === true || subtype === 'error' || subtype?.startsWith('error_') === true;
          if (isErrorResult) {
            const message = resultText.trim() || errorText.trim() || errors.join('\n').trim() || 'claude returned an error result frame';
            yield {
              type: 'error',
              error: message,
              retryable: message.includes('rate') || message.includes('overloaded'),
            };
            return;
          }
          if (resultText.length > 0 && !emittedText) {
            yield { type: 'text', content: resultText };
            emittedText = true;
          }
          const usage = parsed['usage'] as Record<string, number> | undefined;
          totalInputTokens =
            usage?.['input_tokens'] ??
            usage?.['inputTokens'] ??
            (parsed['total_input_tokens'] as number | undefined) ??
            totalInputTokens;
          totalOutputTokens =
            usage?.['output_tokens'] ??
            usage?.['outputTokens'] ??
            (parsed['total_output_tokens'] as number | undefined) ??
            totalOutputTokens;
          if (!emittedText && !emittedToolUse) {
            yield {
              type: 'error',
              error: 'claude result frame contained no text output',
              retryable: false,
            };
            return;
          }
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
        } else if (type === 'content_block_start') {
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
            emittedText = true;
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
            emittedToolUse = true;
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
        } else if (type === 'assistant') {
          const message = parsed['message'] as Record<string, unknown> | undefined;
          const usage = message?.['usage'] as Record<string, number> | undefined;
          if (usage) {
            totalInputTokens = usage['input_tokens'] ?? usage['inputTokens'] ?? totalInputTokens;
            totalOutputTokens = usage['output_tokens'] ?? usage['outputTokens'] ?? totalOutputTokens;
          }
          const content = (message?.['content'] ?? parsed['content']) as unknown;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (!block || typeof block !== 'object') continue;
              const record = block as Record<string, unknown>;
              if (record['type'] === 'text' && typeof record['text'] === 'string') {
                yield { type: 'text', content: record['text'] };
                emittedText = true;
              } else if (record['type'] === 'tool_use') {
                yield {
                  type: 'tool_use',
                  id: (record['id'] as string) ?? deterministicUuid('packages/franken-orchestrator/src/providers/claude-cli-adapter.ts'),
                  name: record['name'] as string,
                  input: record['input'] ?? {},
                };
                emittedToolUse = true;
              }
            }
          } else {
            const parts: string[] = [];
            tryExtractTextFromNode(content ?? message ?? parsed, parts);
            const text = parts.join('');
            if (text.length > 0) {
              yield { type: 'text', content: text };
              emittedText = true;
            }
          }
        } else if (type === 'user') {
          continue;
        } else if (type === 'message_stop') {
          if (!emittedText && !emittedToolUse) {
            yield {
              type: 'error',
              error: 'claude stream completed without parseable text',
              retryable: true,
            };
            return;
          }
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

      // If process exited without message_stop, check spawn/exit status
      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on('close', resolve);
      });
      if (spawnState.message) {
        streamCompleted = true;
        yield {
          type: 'error',
          error: `claude process failed to start: ${spawnState.message}`,
          retryable: false,
        };
        return;
      }
      if (exitCode !== 0) {
        yield {
          type: 'error',
          error: `claude process exited with code ${exitCode}`,
          retryable: false,
        };
      } else if (!emittedText) {
        yield {
          type: 'error',
          error: 'claude process exited without producing a result frame or text output',
          retryable: false,
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
