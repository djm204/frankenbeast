import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { IAdapter } from './adapter-llm-client.js';
import {
  createDefaultRegistry,
  resolveProviderCacheCapabilities,
  type ICliProvider,
  type ProviderRegistry,
} from '../skills/providers/cli-provider.js';
import {
  classifyCommandFailure,
  commandFailureFromExecError,
  parseResetTimeText,
  type CommandFailure,
} from '../errors/command-failure.js';

type CliCacheSessionHint = {
  key: string;
  persist?: boolean;
};

type CliTransformed = {
  prompt: string;
  maxTurns: number;
  model: string | undefined;
  chatMode: boolean;
  sessionContinue: boolean;
  cacheSession?: CliCacheSessionHint | undefined;
  requestId?: string | undefined;
};

type ProviderOverride = {
  command?: string | undefined;
  model?: string | undefined;
  extraArgs?: readonly string[] | undefined;
};

type LlmReplayRecorder = (record: {
  kind: 'llm.request' | 'llm.response';
  runId: string;
  provider?: string | undefined;
  model?: string | undefined;
  content: string;
}) => void;

type ReplayRunId = string | (() => string | undefined);

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
  /** Capture replayable LLM request/response content. */
  replayRecorder?: LlmReplayRecorder | undefined;
  /** Stable run/session id for replay records. Defaults to per-request id. */
  replayRunId?: ReplayRunId | undefined;
  /** Provider fallback chain; selected provider is normalized to the front. */
  providers?: readonly string[] | undefined;
  /** Registry for resolving fallback providers. Defaults to built-ins. */
  registry?: ProviderRegistry | undefined;
  /** Per-provider command/model overrides. */
  providerOverrides?: Record<string, ProviderOverride> | undefined;
  /** Maximum all-provider rate-limit retry cycles before surfacing a terminal error. */
  maxRateLimitRetries?: number | undefined;
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
    replayRecorder?: LlmReplayRecorder | undefined;
    replayRunId?: ReplayRunId | undefined;
    providers?: readonly string[] | undefined;
    providerOverrides?: Record<string, ProviderOverride> | undefined;
    maxRateLimitRetries: number;
    _sleepFn?: ((durationMs: number) => Promise<void>) | undefined;
  };
  private readonly _spawn: SpawnFn;
  private readonly registry: ProviderRegistry;
  private readonly responseProviders = new Map<string, string>();
  private readonly responseSessions = new Map<string, { provider: string; model?: string | undefined; sessionKey: string }>();
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
      ...(opts.replayRecorder !== undefined ? { replayRecorder: opts.replayRecorder } : {}),
      ...(opts.replayRunId !== undefined ? { replayRunId: opts.replayRunId } : {}),
      ...(opts.providers !== undefined ? { providers: opts.providers } : {}),
      ...(opts.providerOverrides !== undefined ? { providerOverrides: opts.providerOverrides } : {}),
      maxRateLimitRetries: normalizeRateLimitRetryLimit(opts.maxRateLimitRetries),
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
      cacheSession?: CliCacheSessionHint;
      sessionContinue?: boolean;
    };
    const userMessages = req.messages.filter((m) => m.role === 'user');
    const last = userMessages[userMessages.length - 1];
    const cacheSession = req.cacheSession;
    const cacheCapabilities = resolveProviderCacheCapabilities(this.provider);
    const sessionContinue = this.opts.chatMode
      ? req.sessionContinue ?? this.chatCallCount > 0
      : Boolean(cacheSession?.key && cacheCapabilities.nativeWorkSessions);
    const transformed: CliTransformed = {
      prompt: last?.content ?? '',
      maxTurns: 1,
      model: this.opts.model,
      chatMode: this.opts.chatMode,
      sessionContinue,
      ...(req.id ? { requestId: req.id } : {}),
    };
    if (cacheSession) {
      transformed.cacheSession = cacheSession;
    }
    return transformed;
  }

  async execute(providerRequest: unknown): Promise<string> {
    const { prompt, maxTurns, model, chatMode, sessionContinue, requestId, cacheSession } = providerRequest as CliTransformed;
    if (chatMode) this.chatCallCount++;
    const providers = normalizeProviderChain(this.provider.name, this.opts.providers);
    const exhaustedProviders = new Map<string, CommandFailure>();
    const sleepFn = this.opts._sleepFn ?? defaultSleep;
    const initialProvider = this.provider.name;
    let activeProvider = initialProvider;
    let rateLimitRetryCycles = 0;

    while (true) {
      const provider = this.resolveProvider(activeProvider);
      const activeModel = this.resolveModel(activeProvider, model);
      if (requestId) {
        const replayRunId = this.resolveReplayRunId(requestId);
        this.opts.replayRecorder?.({
          kind: 'llm.request',
          runId: replayRunId,
          provider: activeProvider,
          ...(activeModel ? { model: activeModel } : {}),
          content: prompt,
        });
      }
      const activeCommand = this.resolveCommand(activeProvider);
      let result: { stdout: string; stderr: string; exitCode: number };
      try {
        result = await this.spawnSingle({
          cmd: activeCommand,
          args: provider.buildArgs({
            maxTurns,
            model: activeModel,
            chatMode,
            sessionContinue,
            extraArgs: this.resolveExtraArgs(activeProvider),
          }),
          env: provider.filterEnv(this.captureEnv()),
          prompt,
        });
      } catch (error) {
        if (requestId) {
          this.responseSessions.delete(requestId);
        }

        const failure = commandFailureFromExecError({
          tool: 'llm',
          provider: activeProvider,
          command: activeCommand,
          error,
          detectRateLimit: (text) => provider.isRateLimited(text),
          parseRetryAfterMs: (text) => {
            const providerMs = provider.parseRetryAfter(text);
            if (providerMs !== undefined) {
              return providerMs;
            }
            const parsed = parseResetTimeText(text);
            return parsed.sleepSeconds >= 0 ? parsed.sleepSeconds * 1000 : undefined;
          },
        });

        if (failure.kind === 'spawn_error') {
          exhaustedProviders.set(activeProvider, failure);
          const nextProvider = providers.find((name) => !exhaustedProviders.has(name));
          if (nextProvider) {
            activeProvider = nextProvider;
            continue;
          }
          if (hasRateLimitedProvider(exhaustedProviders)) {
            if (rateLimitRetryCycles >= this.opts.maxRateLimitRetries) {
              throw new Error(buildRateLimitRetryExhaustedSummary(exhaustedProviders, rateLimitRetryCycles), {
                cause: lastRateLimitedFailure(exhaustedProviders),
              });
            }
            const sleepMs = this.resolveSleepMs(exhaustedProviders);
            await sleepFn(sleepMs);
            rateLimitRetryCycles++;
            exhaustedProviders.clear();
            activeProvider = initialProvider;
            continue;
          }
          throw new Error(buildNoCliProvidersAvailableSummary(exhaustedProviders), { cause: failure });
        }

        throw new Error(failure.summary, { cause: failure });
      }

      if (result.exitCode === 0) {
        if (requestId) {
          const replayRunId = this.resolveReplayRunId(requestId);
          const normalizedOutput = provider.normalizeOutput(result.stdout);
          this.opts.replayRecorder?.({
            kind: 'llm.response',
            runId: replayRunId,
            provider: activeProvider,
            ...(activeModel ? { model: activeModel } : {}),
            content: normalizedOutput,
          });
          this.responseProviders.set(requestId, activeProvider);
          if (cacheSession?.persist && resolveProviderCacheCapabilities(provider).persistentAcrossProcesses) {
            this.responseSessions.set(requestId, {
              provider: activeProvider,
              ...(this.resolveModel(activeProvider, model) ? { model: this.resolveModel(activeProvider, model) } : {}),
              sessionKey: cacheSession.key,
            });
          }
        }
        return result.stdout;
      }

      if (requestId) {
        this.responseSessions.delete(requestId);
      }

      const failure = classifyCommandFailure({
        tool: 'llm',
        provider: activeProvider,
        command: activeCommand,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        normalizedOutput: provider.normalizeOutput(result.stdout),
        detectRateLimit: (text) => provider.isRateLimited(text),
        parseRetryAfterMs: (text) => {
          const providerMs = provider.parseRetryAfter(text);
          if (providerMs !== undefined) {
            return providerMs;
          }
          const parsed = parseResetTimeText(text);
          return parsed.sleepSeconds >= 0 ? parsed.sleepSeconds * 1000 : undefined;
        },
      });

      if (!failure.rateLimited) {
        throw new Error(failure.summary, { cause: failure });
      }

      exhaustedProviders.set(activeProvider, failure);

      const nextProvider = providers.find((name) => !exhaustedProviders.has(name));
      if (nextProvider) {
        activeProvider = nextProvider;
        continue;
      }

      const sleepMs = this.resolveSleepMs(exhaustedProviders);
      if (rateLimitRetryCycles >= this.opts.maxRateLimitRetries) {
        throw new Error(buildRateLimitRetryExhaustedSummary(exhaustedProviders, rateLimitRetryCycles), {
          cause: lastRateLimitedFailure(exhaustedProviders),
        });
      }
      await sleepFn(sleepMs);
      rateLimitRetryCycles++;
      exhaustedProviders.clear();
      activeProvider = initialProvider;
    }
  }

  transformResponse(providerResponse: unknown, _requestId: string): { content: string | null } {
    const raw = providerResponse as string;
    const providerName = this.responseProviders.get(_requestId) ?? this.provider.name;
    this.responseProviders.delete(_requestId);
    const normalized = this.resolveProvider(providerName).normalizeOutput(raw ?? '');
    return { content: normalized };
  }

  validateCapabilities(feature: string): boolean {
    return feature === 'text-completion';
  }

  consumeSessionMetadata(requestId: string): { provider: string; model?: string | undefined; sessionKey: string } | undefined {
    const session = this.responseSessions.get(requestId);
    if (!session) {
      return undefined;
    }
    this.responseSessions.delete(requestId);
    return session;
  }

  private resolveProvider(name: string): ICliProvider {
    if (name === this.provider.name) {
      return this.provider;
    }
    return this.registry.get(name);
  }

  private resolveReplayRunId(requestId: string): string {
    const configured = this.opts.replayRunId;
    if (typeof configured === 'function') {
      return configured() ?? requestId;
    }
    return configured ?? requestId;
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

  private resolveExtraArgs(name: string): readonly string[] | undefined {
    return this.opts.providerOverrides?.[name]?.extraArgs;
  }

  private captureEnv(): Record<string, string> {
    const rawEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) rawEnv[key] = value;
    }
    return rawEnv;
  }

  private resolveSleepMs(exhaustedProviders: Map<string, CommandFailure>): number {
    let shortestMs = Number.POSITIVE_INFINITY;

    for (const [, failure] of exhaustedProviders) {
      if (failure.retryAfterMs !== undefined) {
        shortestMs = Math.min(shortestMs, failure.retryAfterMs);
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
      let timedOut = false;
      let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
      let lineBuffer = '';

      const clearTimers = (): void => {
        clearTimeout(timer);
        if (hardKillTimer) {
          clearTimeout(hardKillTimer);
          hardKillTimer = undefined;
        }
      };

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
        timedOut = true;
        child.kill('SIGTERM');
        hardKillTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch (error) {
            console.warn('[CliLlmAdapter] Failed to hard-kill timed-out CLI process', {
              signal: 'SIGKILL',
              pid: child.pid,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }, 5_000);
        // Don't keep the event loop alive waiting on the hard-kill fallback;
        // short-lived invocations should exit promptly after a timeout reject.
        hardKillTimer.unref();
        const error = Object.assign(new Error(`CLI timeout after ${this.opts.timeoutMs}ms`), { code: 'ETIMEDOUT' });
        settle(() => reject(error));
      }, this.opts.timeoutMs);

      child.on('close', (code) => {
        clearTimers();
        if (this.opts.onStreamLine && lineBuffer.trim().length > 0) {
          this.opts.onStreamLine(lineBuffer);
        }
        if (timedOut) return;
        settle(() => resolve({ stdout, stderr, exitCode: code ?? 1 }));
      });

      child.on('error', (err) => {
        if (timedOut) {
          // An 'error' here can mean the process couldn't be killed; keep the
          // scheduled hard-kill (SIGKILL) so a process that ignored SIGTERM is
          // still terminated. Only cancel the original deadline timer.
          clearTimeout(timer);
          return;
        }
        clearTimers();
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

function hasRateLimitedProvider(exhaustedProviders: Map<string, CommandFailure>): boolean {
  return [...exhaustedProviders.values()].some((failure) => failure.rateLimited);
}

function lastRateLimitedFailure(exhaustedProviders: Map<string, CommandFailure>): CommandFailure | undefined {
  return [...exhaustedProviders.values()].reverse().find((failure) => failure.rateLimited);
}

function normalizeRateLimitRetryLimit(limit: number | undefined): number {
  if (limit === undefined) return 3;
  if (!Number.isFinite(limit)) return 3;
  return Math.max(0, Math.floor(limit));
}

function buildRateLimitRetryExhaustedSummary(
  exhaustedProviders: Map<string, CommandFailure>,
  retryCycles: number,
): string {
  const providerSummaries = [...exhaustedProviders.entries()]
    .map(([provider, failure]) => {
      const retryAfter = failure.retryAfterMs !== undefined ? `; retry after ${failure.retryAfterMs}ms` : '';
      return `${provider}: ${failure.summary}${retryAfter}`;
    })
    .join(' | ');
  const cycleLabel = retryCycles === 1 ? 'retry cycle' : 'retry cycles';
  return [
    `All configured LLM providers remained rate limited after ${retryCycles} ${cycleLabel}.`,
    providerSummaries ? `Last failures: ${providerSummaries}.` : '',
    'Wait for provider quota reset, reduce request concurrency, or configure an available fallback provider.',
  ].filter(Boolean).join(' ');
}

function buildNoCliProvidersAvailableSummary(exhaustedProviders: Map<string, CommandFailure>): string {
  const attempted = [...exhaustedProviders.entries()]
    .map(([provider, failure]) => {
      const code = typeof failure.details?.code === 'string' ? ` (${failure.details.code})` : '';
      return `${provider}: ${failure.command}${code}`;
    })
    .join(', ');
  return [
    'No configured LLM provider CLI is available.',
    attempted ? `Tried: ${attempted}.` : '',
    'Install one of: claude, codex, gemini, aider; or configure a provider command override.',
  ].filter(Boolean).join(' ');
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
