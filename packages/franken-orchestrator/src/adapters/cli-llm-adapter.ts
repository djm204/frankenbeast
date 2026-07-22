import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { ProviderContext, TokenUsage } from '@franken/types';
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
import { isPlainOutput, stripAnsi } from '../logging/beast-logger.js';

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
  sessionId?: string | undefined;
  cacheSession?: CliCacheSessionHint | undefined;
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
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

export type CliLlmLifecycleEvent =
  | { type: 'attempt'; provider: string; attempt: number }
  | { type: 'complete'; provider: string; attempt: number }
  | { type: 'rate-limit'; provider: string }
  | { type: 'failure'; provider: string }
  | { type: 'fallback'; from: string; to: string }
  | { type: 'wait'; durationMs: number }
  | { type: 'timeout'; provider: string; durationMs: number };

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
  /** Called with bounded provider lifecycle metadata; never includes prompt or output. */
  onLifecycleEvent?: (event: CliLlmLifecycleEvent) => void;
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
    onLifecycleEvent?: (event: CliLlmLifecycleEvent) => void;
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
  private readonly responseSessions = new Map<string, { provider: string; model?: string | undefined; sessionId: string }>();
  private readonly responseProviderContext = new Map<string, ProviderContext>();
  private readonly chatNativeSessions = new Map<string, string>();
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
      ...(opts.onLifecycleEvent !== undefined ? { onLifecycleEvent: opts.onLifecycleEvent } : {}),
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
      session_id?: string;
      signal?: AbortSignal;
      timeoutMs?: number;
    };
    const userMessages = req.messages.filter((m) => m.role === 'user');
    const last = userMessages[userMessages.length - 1];
    const cacheSession = req.cacheSession;
    const cacheCapabilities = resolveProviderCacheCapabilities(this.provider);
    const sessionContinue = this.opts.chatMode
      ? req.sessionContinue ?? this.chatCallCount > 0
      : Boolean(cacheSession?.key && req.session_id && cacheCapabilities.nativeWorkSessions);
    const transformed: CliTransformed = {
      prompt: last?.content ?? '',
      maxTurns: 1,
      model: this.opts.model,
      chatMode: this.opts.chatMode,
      sessionContinue,
      ...(req.session_id ? { sessionId: req.session_id } : {}),
      ...(req.id ? { requestId: req.id } : {}),
      ...(req.signal ? { signal: req.signal } : {}),
      ...(req.timeoutMs !== undefined ? { timeoutMs: req.timeoutMs } : {}),
    };
    if (cacheSession) {
      transformed.cacheSession = cacheSession;
    }
    return transformed;
  }

  async execute(providerRequest: unknown): Promise<string> {
    const {
      prompt,
      maxTurns,
      model,
      chatMode,
      sessionContinue,
      sessionId,
      requestId,
      cacheSession,
      signal: callerSignal,
      timeoutMs: requestedTimeoutMs,
    } = providerRequest as CliTransformed;
    if (chatMode) this.chatCallCount++;
    const providers = normalizeProviderChain(this.provider.name, this.opts.providers);
    const exhaustedProviders = new Map<string, CommandFailure>();
    const sleepFn = this.opts._sleepFn ?? defaultSleep;
    const initialProvider = this.provider.name;
    let activeProvider = initialProvider;
    let rateLimitRetryCycles = 0;
    let attempt = 0;
    // Ground truth for "what model/provider are you running?" — set only at
    // the point a fallback actually occurs, so a clean single-provider run
    // never reports a bogus switch.
    let fallbackFrom: string | undefined;
    let fallbackReason: string | undefined;
    const timeoutMs = requestedTimeoutMs ?? this.opts.timeoutMs;
    const deadlineAt = Date.now() + timeoutMs;
    const logicalController = new AbortController();
    const abortFromCaller = (): void => {
      logicalController.abort(
        callerSignal?.reason instanceof Error
          ? callerSignal.reason
          : new Error('LLM request cancelled'),
      );
    };
    if (callerSignal?.aborted) {
      abortFromCaller();
    } else {
      callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    }
    const logicalTimeout = setTimeout(() => {
      logicalController.abort(
        Object.assign(new Error(`CLI timeout after ${timeoutMs}ms`), { code: 'ETIMEDOUT' }),
      );
    }, timeoutMs);
    logicalTimeout.unref?.();
    const signal = logicalController.signal;

    try {
      while (true) {
        throwIfAborted(signal);
        attempt++;
      const provider = this.resolveProvider(activeProvider);
      const activeModel = this.resolveModel(activeProvider, model);
      this.opts.onLifecycleEvent?.({ type: 'attempt', provider: activeProvider, attempt });
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
      const providerSessionContinue = sessionContinue && (chatMode || activeProvider === initialProvider);
      let result: { stdout: string; stderr: string; exitCode: number };
      try {
        result = await this.spawnSingle({
          cmd: activeCommand,
          args: provider.buildArgs({
            maxTurns,
            model: activeModel,
            chatMode,
            sessionContinue: providerSessionContinue,
            persistSession: Boolean(cacheSession?.persist),
            ...(sessionId && (chatMode || activeProvider === initialProvider)
              ? { sessionId: chatMode ? this.resolveProviderSessionId(activeProvider, sessionId, providerSessionContinue) : sessionId }
              : {}),
            extraArgs: this.resolveExtraArgs(activeProvider),
          }),
          env: provider.filterEnv(this.captureEnv()),
          prompt,
          signal,
          timeoutMs: Math.max(1, deadlineAt - Date.now()),
        });
      } catch (error) {
        if (requestId) {
          this.responseSessions.delete(requestId);
        }
        throwIfAborted(signal);

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

        if (failure.rateLimited) {
          this.opts.onLifecycleEvent?.({ type: 'rate-limit', provider: activeProvider });
        } else if (error instanceof Error && /timeout/i.test(error.message)) {
          this.opts.onLifecycleEvent?.({
            type: 'timeout',
            provider: activeProvider,
            durationMs: this.opts.timeoutMs,
          });
        } else {
          this.opts.onLifecycleEvent?.({ type: 'failure', provider: activeProvider });
        }

        if (failure.kind === 'spawn_error') {
          exhaustedProviders.set(activeProvider, failure);
          const nextProvider = providers.find((name) => !exhaustedProviders.has(name));
          if (nextProvider) {
            this.opts.onLifecycleEvent?.({ type: 'fallback', from: activeProvider, to: nextProvider });
            fallbackFrom ??= initialProvider;
            fallbackReason ??= failure.rateLimited ? 'rate_limited' : 'unavailable';
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
            this.opts.onLifecycleEvent?.({ type: 'wait', durationMs: sleepMs });
            await sleepWithAbort(sleepMs, sleepFn, signal);
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
        this.opts.onLifecycleEvent?.({ type: 'complete', provider: activeProvider, attempt });
      if (chatMode && sessionId) {
        const nativeSessionId = this.extractNativeSessionId(result.stdout);
        if (nativeSessionId) {
          this.chatNativeSessions.set(this.chatSessionMapKey(activeProvider, sessionId), nativeSessionId);
        }
      }
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
          this.responseProviderContext.set(requestId, {
            provider: activeProvider,
            ...(activeModel ? { model: activeModel } : {}),
            ...(fallbackFrom && fallbackFrom !== activeProvider
              ? { switchedFrom: fallbackFrom, ...(fallbackReason ? { switchReason: fallbackReason } : {}) }
              : {}),
          });
          if (cacheSession?.persist && resolveProviderCacheCapabilities(provider).persistentAcrossProcesses) {
            const nativeSessionId = this.extractNativeSessionId(result.stdout);
            if (nativeSessionId) {
              this.responseSessions.set(requestId, {
                provider: activeProvider,
                ...(this.resolveModel(activeProvider, model) ? { model: this.resolveModel(activeProvider, model) } : {}),
                sessionId: nativeSessionId,
              });
            }
          }
        }
        return result.stdout;
      }

      if (requestId) {
        this.responseSessions.delete(requestId);
      }

      const failureStdout = isPlainOutput() ? stripAnsi(result.stdout) : result.stdout;
      const failureStderr = isPlainOutput() ? stripAnsi(result.stderr) : result.stderr;
      const normalizedFailureOutput = provider.normalizeOutput(failureStdout);
      const failure = classifyCommandFailure({
        tool: 'llm',
        provider: activeProvider,
        command: activeCommand,
        exitCode: result.exitCode,
        stdout: failureStdout,
        stderr: failureStderr,
        normalizedOutput: isPlainOutput() ? stripAnsi(normalizedFailureOutput) : normalizedFailureOutput,
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
        this.opts.onLifecycleEvent?.({ type: 'failure', provider: activeProvider });
        throw new Error(failure.summary, { cause: failure });
      }

      this.opts.onLifecycleEvent?.({ type: 'rate-limit', provider: activeProvider });
      exhaustedProviders.set(activeProvider, failure);

      const nextProvider = providers.find((name) => !exhaustedProviders.has(name));
      if (nextProvider) {
        this.opts.onLifecycleEvent?.({ type: 'fallback', from: activeProvider, to: nextProvider });
        fallbackFrom ??= initialProvider;
        fallbackReason ??= 'rate_limited';
        activeProvider = nextProvider;
        continue;
      }

      const sleepMs = this.resolveSleepMs(exhaustedProviders);
      if (rateLimitRetryCycles >= this.opts.maxRateLimitRetries) {
        throw new Error(buildRateLimitRetryExhaustedSummary(exhaustedProviders, rateLimitRetryCycles), {
          cause: lastRateLimitedFailure(exhaustedProviders),
        });
      }
      this.opts.onLifecycleEvent?.({ type: 'wait', durationMs: sleepMs });
      await sleepWithAbort(sleepMs, sleepFn, signal);
      rateLimitRetryCycles++;
      exhaustedProviders.clear();
      activeProvider = initialProvider;
      }
    } finally {
      clearTimeout(logicalTimeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  transformResponse(providerResponse: unknown, _requestId: string): { content: string | null; usage?: TokenUsage; providerContext?: ProviderContext } {
    const raw = providerResponse as string;
    const providerName = this.responseProviders.get(_requestId) ?? this.provider.name;
    this.responseProviders.delete(_requestId);
    const storedContext = this.responseProviderContext.get(_requestId);
    this.responseProviderContext.delete(_requestId);
    const resolved = this.resolveProvider(providerName);
    const normalized = resolved.normalizeOutput(raw ?? '');
    const usage = resolved.extractUsage?.(raw ?? '');
    // The CLI's own reported model (when it exposes one) reflects what
    // actually executed and wins over the statically configured value —
    // e.g. account-level routing this codebase has no other visibility into.
    const extractedModel = resolved.extractModel?.(raw ?? '');
    const providerContext = storedContext
      ? { ...storedContext, ...(extractedModel ? { model: extractedModel } : {}) }
      : undefined;
    return {
      content: isPlainOutput() ? stripAnsi(normalized) : normalized,
      ...(usage ? { usage } : {}),
      ...(providerContext ? { providerContext } : {}),
    };
  }

  validateCapabilities(feature: string): boolean {
    return feature === 'text-completion';
  }

  getProviderName(): string {
    return this.provider.name;
  }

  consumeSessionMetadata(requestId: string): { provider: string; model?: string | undefined; sessionId: string } | undefined {
    const session = this.responseSessions.get(requestId);
    if (!session) {
      return undefined;
    }
    this.responseSessions.delete(requestId);
    return session;
  }

  private resolveProviderSessionId(provider: string, appSessionId: string, sessionContinue: boolean): string | undefined {
    if (!sessionContinue) {
      return appSessionId;
    }
    return this.resolveNativeChatSessionId(provider, appSessionId);
  }

  private resolveNativeChatSessionId(provider: string, appSessionId: string): string | undefined {
    return this.chatNativeSessions.get(this.chatSessionMapKey(provider, appSessionId));
  }

  private chatSessionMapKey(provider: string, appSessionId: string): string {
    return `${provider}:${appSessionId}`;
  }

  private extractNativeSessionId(stdout: string): string | undefined {
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as { session_id?: unknown; sessionId?: unknown };
        const sessionId = event.session_id ?? event.sessionId;
        if (typeof sessionId === 'string' && sessionId.length > 0) {
          return sessionId;
        }
      } catch {
        // Non-JSON provider output is normal for non-streaming CLIs.
      }
    }
    return undefined;
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
    if (isPlainOutput()) {
      rawEnv.NO_COLOR = rawEnv.NO_COLOR ?? '1';
      rawEnv.FORCE_COLOR = '0';
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
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
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
      let terminated = false;
      let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
      let lineBuffer = '';

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      const scheduleHardKill = (): void => {
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
        // Do not keep short-lived invocations alive for the hard-kill fallback.
        hardKillTimer.unref();
      };

      const terminate = (label: 'timed-out' | 'aborted'): void => {
        terminated = true;
        try {
          child.kill('SIGTERM');
        } catch (error) {
          console.warn(`[CliLlmAdapter] Failed to terminate ${label} CLI process`, {
            signal: 'SIGTERM',
            pid: child.pid,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        scheduleHardKill();
      };

      const effectiveTimeoutMs = input.timeoutMs ?? this.opts.timeoutMs;
      const timer = setTimeout(() => {
        input.signal?.removeEventListener('abort', abortRequest);
        terminate('timed-out');
        const error = Object.assign(new Error(`CLI timeout after ${effectiveTimeoutMs}ms`), { code: 'ETIMEDOUT' });
        settle(() => reject(error));
      }, effectiveTimeoutMs);

      const clearTimers = (): void => {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', abortRequest);
        if (hardKillTimer) {
          clearTimeout(hardKillTimer);
          hardKillTimer = undefined;
        }
      };

      const abortRequest = (): void => {
        if (settled) return;
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', abortRequest);
        const reason = input.signal?.reason;
        const timedOut = reason instanceof Error
          && (reason as NodeJS.ErrnoException).code === 'ETIMEDOUT';
        terminate(timedOut ? 'timed-out' : 'aborted');
        settle(() => reject(reason instanceof Error ? reason : new Error('LLM request aborted')));
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

      if (input.signal?.aborted) {
        abortRequest();
      } else {
        input.signal?.addEventListener('abort', abortRequest, { once: true });
      }

      child.on('close', (code) => {
        clearTimers();
        if (this.opts.onStreamLine && lineBuffer.trim().length > 0) {
          this.opts.onStreamLine(lineBuffer);
        }
        if (terminated) return;
        settle(() => resolve({ stdout, stderr, exitCode: code ?? 1 }));
      });

      child.on('error', (err) => {
        if (terminated) {
          // Preserve the scheduled SIGKILL fallback if termination failed.
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

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('LLM request aborted');
}

function sleepWithAbort(
  durationMs: number,
  sleepFn: (durationMs: number) => Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!signal) return sleepFn(durationMs);
  throwIfAborted(signal);

  if (sleepFn === defaultSleep) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, durationMs);
      const abort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(signal.reason instanceof Error ? signal.reason : new Error('LLM request aborted'));
      };
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason instanceof Error ? signal.reason : new Error('LLM request aborted'));
    };
    signal.addEventListener('abort', abort, { once: true });
    sleepFn(durationMs).then(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
