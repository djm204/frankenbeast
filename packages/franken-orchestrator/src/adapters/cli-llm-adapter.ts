import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { IAdapter } from './adapter-llm-client.js';
import { createDefaultRegistry, type ICliProvider, type ProviderRegistry } from '../skills/providers/cli-provider.js';

type CliTransformed = {
  prompt: string;
  maxTurns: number;
  model: string | undefined;
  chatMode: boolean;
  sessionContinue: boolean;
  requestId?: string | undefined;
};

type ProviderOverride = {
  command?: string | undefined;
  model?: string | undefined;
};

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface CliLlmAdapterOpts {
  workingDir: string;
  timeoutMs?: number;
  commandOverride?: string;
  /** Override the model used for completions (e.g. 'claude-sonnet-4-6'). */
  model?: string;
  /** When true, omit tool/permission flags — used for conversational chat. */
  chatMode?: boolean;
  /** Called with each complete line of stdout as it arrives (for streaming progress). */
  onStreamLine?: (line: string) => void;
  /** Provider fallback chain; selected provider is normalized to the front. */
  providers?: readonly string[] | undefined;
  /** Registry for resolving fallback providers. Defaults to built-ins. */
  registry?: ProviderRegistry | undefined;
  /** Per-provider command/model overrides. */
  providerOverrides?: Record<string, ProviderOverride> | undefined;
  /** @internal Injectable sleep for tests. */
  _sleepFn?: ((durationMs: number) => Promise<void>) | undefined;
}

export class CliLlmAdapter implements IAdapter {
  private readonly provider: ICliProvider;
  private readonly opts: {
    workingDir: string;
    timeoutMs: number;
    commandOverride?: string;
    model?: string;
    chatMode: boolean;
    onStreamLine?: (line: string) => void;
    providers?: readonly string[] | undefined;
    providerOverrides?: Record<string, ProviderOverride> | undefined;
    _sleepFn?: ((durationMs: number) => Promise<void>) | undefined;
  };
  private readonly _spawn: SpawnFn;
  private readonly registry: ProviderRegistry;
  private readonly responseProviders = new Map<string, string>();
  private chatCallCount = 0;

  constructor(
    provider: ICliProvider,
    opts: CliLlmAdapterOpts,
    _spawnFn?: SpawnFn,
  ) {
    this.provider = provider;
    this.opts = {
      workingDir: opts.workingDir,
      timeoutMs: opts.timeoutMs ?? 120_000,
      chatMode: opts.chatMode ?? false,
      ...(opts.commandOverride !== undefined ? { commandOverride: opts.commandOverride } : {}),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.onStreamLine !== undefined ? { onStreamLine: opts.onStreamLine } : {}),
      ...(opts.providers !== undefined ? { providers: opts.providers } : {}),
      ...(opts.providerOverrides !== undefined ? { providerOverrides: opts.providerOverrides } : {}),
      ...(opts._sleepFn !== undefined ? { _sleepFn: opts._sleepFn } : {}),
    };
    this._spawn = _spawnFn ?? (nodeSpawn as SpawnFn);
    this.registry = opts.registry ?? createDefaultRegistry();
    if (!this.registry.has(provider.name)) {
      this.registry.register(provider);
    }
  }

  transformRequest(request: unknown): CliTransformed {
    const req = request as {
      id?: string;
      messages: Array<{ role: string; content: string }>;
    };
    const userMessages = req.messages.filter((m) => m.role === 'user');
    const last = userMessages[userMessages.length - 1];
    const sessionContinue = this.opts.chatMode && this.chatCallCount > 0;
    return {
      prompt: last?.content ?? '',
      maxTurns: 1,
      model: this.opts.model,
      chatMode: this.opts.chatMode,
      sessionContinue,
      ...(req.id ? { requestId: req.id } : {}),
    };
  }

  async execute(providerRequest: unknown): Promise<string> {
    const { prompt, maxTurns, model, chatMode, sessionContinue, requestId } = providerRequest as CliTransformed;
    if (chatMode) this.chatCallCount++;
    const providers = normalizeProviderChain(this.provider.name, this.opts.providers);
    const exhaustedProviders = new Map<string, { stderr: string; stdout: string }>();
    const sleepFn = this.opts._sleepFn ?? defaultSleep;
    const initialProvider = this.provider.name;
    let activeProvider = initialProvider;

    while (true) {
      const provider = this.resolveProvider(activeProvider);
      const result = await this.spawnSingle({
        cmd: this.resolveCommand(activeProvider),
        args: provider.buildArgs({
          maxTurns,
          model: this.resolveModel(activeProvider, model),
          chatMode,
          sessionContinue,
        }),
        env: provider.filterEnv(this.captureEnv()),
        prompt,
      });

      if (result.exitCode === 0) {
        if (requestId) {
          this.responseProviders.set(requestId, activeProvider);
        }
        return result.stdout;
      }

      if (!provider.isRateLimited(result.stderr)) {
        throw new Error(`CLI exited with code ${result.exitCode}: ${result.stderr}`);
      }

      exhaustedProviders.set(activeProvider, {
        stderr: result.stderr,
        stdout: result.stdout,
      });

      const nextProvider = providers.find((name) => !exhaustedProviders.has(name));
      if (nextProvider) {
        activeProvider = nextProvider;
        continue;
      }

      const sleepMs = this.resolveSleepMs(exhaustedProviders);
      await sleepFn(sleepMs);
      exhaustedProviders.clear();
      activeProvider = initialProvider;
    }
  }

  transformResponse(providerResponse: unknown, _requestId: string): { content: string | null } {
    const raw = providerResponse as string;
    if (!raw) return { content: '' };
    const providerName = this.responseProviders.get(_requestId) ?? this.provider.name;
    this.responseProviders.delete(_requestId);
    const normalized = this.resolveProvider(providerName).normalizeOutput(raw);
    return { content: normalized };
  }

  validateCapabilities(feature: string): boolean {
    return feature === 'text-completion';
  }

  private resolveProvider(name: string): ICliProvider {
    if (name === this.provider.name) {
      return this.provider;
    }
    return this.registry.get(name);
  }

  private resolveCommand(name: string): string {
    const override = this.opts.providerOverrides?.[name]?.command;
    if (override) return override;
    if (name === this.provider.name && this.opts.commandOverride) {
      return this.opts.commandOverride;
    }
    return this.resolveProvider(name).command;
  }

  private resolveModel(name: string, requestModel: string | undefined): string | undefined {
    const override = this.opts.providerOverrides?.[name]?.model;
    if (override !== undefined) return override;
    if (name === this.provider.name) {
      return this.opts.model ?? requestModel;
    }
    return undefined;
  }

  private captureEnv(): Record<string, string> {
    const rawEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) rawEnv[key] = value;
    }
    return rawEnv;
  }

  private resolveSleepMs(exhaustedProviders: Map<string, { stderr: string; stdout: string }>): number {
    let shortestMs = Number.POSITIVE_INFINITY;

    for (const [providerName, output] of exhaustedProviders) {
      const provider = this.resolveProvider(providerName);
      const parsedMs = provider.parseRetryAfter(output.stderr);
      if (parsedMs !== undefined) {
        shortestMs = Math.min(shortestMs, parsedMs);
        continue;
      }

      const parsed = parseResetTime(output.stderr, output.stdout);
      if (parsed >= 0) {
        shortestMs = Math.min(shortestMs, parsed);
      }
    }

    if (!Number.isFinite(shortestMs)) {
      return 120_000;
    }

    return shortestMs;
  }

  private spawnSingle(input: {
    cmd: string;
    args: string[];
    env: Record<string, string>;
    prompt: string;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      const child = this._spawn(input.cmd, input.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.opts.workingDir,
        env: input.env,
      });

      child.stdin!.write(input.prompt);
      child.stdin!.end();

      let stdout = '';
      let stderr = '';
      let settled = false;
      let lineBuffer = '';

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      child.stdout!.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;

        if (this.opts.onStreamLine) {
          lineBuffer += text;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop()!;
          for (const line of lines) {
            if (line.trim().length > 0) {
              this.opts.onStreamLine(line);
            }
          }
        }
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        const killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
        }, 5_000);
        killTimer.unref();
        settle(() => reject(new Error(`CLI timeout after ${this.opts.timeoutMs}ms`)));
      }, this.opts.timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (this.opts.onStreamLine && lineBuffer.trim().length > 0) {
          this.opts.onStreamLine(lineBuffer);
        }
        settle(() => resolve({ stdout, stderr, exitCode: code ?? 1 }));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        settle(() => reject(err));
      });
    });
  }
}

function normalizeProviderChain(
  selectedProvider: string,
  providers: readonly string[] | undefined,
): string[] {
  const ordered = [selectedProvider, ...(providers ?? [])];
  return [...new Set(ordered.filter((name) => name.length > 0))];
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function parseResetTime(stderr: string, stdout: string): number {
  const combined = `${stderr}\n${stdout}`;

  const retryAfterHeaderMatch = combined.match(/retry.?after:?\s*(\d+)\s*s?/i);
  if (retryAfterHeaderMatch?.[1]) {
    return parseInt(retryAfterHeaderMatch[1], 10) * 1000;
  }

  const retryAfterPatternMatch = combined.match(/retry.?after\s+(\d+)\s*s?/i);
  if (retryAfterPatternMatch?.[1]) {
    return parseInt(retryAfterPatternMatch[1], 10) * 1000;
  }

  const minutesMatch = combined.match(/try again in (\d+) minute/i);
  if (minutesMatch?.[1]) return parseInt(minutesMatch[1], 10) * 60_000;

  const secondsMatch = combined.match(/try again in (\d+) second/i);
  if (secondsMatch?.[1]) return parseInt(secondsMatch[1], 10) * 1000;

  const isoMatch = combined.match(/resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
  if (isoMatch?.[1]) {
    const resetAt = new Date(isoMatch[1]).getTime();
    const now = Date.now();
    if (resetAt > now) return resetAt - now;
  }

  const epochMatch = combined.match(/x-ratelimit-reset:\s*(\d{10,13})/i);
  if (epochMatch?.[1]) {
    const epoch = parseInt(epochMatch[1], 10);
    const resetMs = epoch > 1e12 ? epoch : epoch * 1000;
    const now = Date.now();
    if (resetMs > now) return resetMs - now;
  }

  const resetsInMatch = combined.match(/resets?\s+in\s+(\d+)\s*s/i);
  if (resetsInMatch?.[1]) return parseInt(resetsInMatch[1], 10) * 1000;

  return -1;
}
