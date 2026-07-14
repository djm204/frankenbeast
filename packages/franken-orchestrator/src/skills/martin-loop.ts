import { isoNow, wallClockNow } from '@franken/types';
/**
 * MartinLoop — the smarter loop.
 *
 * Named after Martin because Ralph was too naive for the job:
 *   - Ralph hardcoded two providers and called it a day.
 *   - Martin uses a pluggable ProviderRegistry — add a new AI agent
 *     by dropping in an ICliProvider, not by editing a god function.
 *   - Ralph panicked on rate limits. Martin gracefully cascades through
 *     a provider fallback chain, parses retry-after headers from every
 *     provider dialect, sleeps the minimum time, then picks back up.
 *   - Ralph dumped raw JSON to the terminal. Martin streams clean text
 *     in real-time through StreamLineBuffer with thinking content dimmed.
 *   - Ralph let plugins poison his child processes. Martin sets
 *     FRANKENBEAST_SPAWNED=1 so rogue plugins know to stand down.
 *
 * Rest in peace, Ralph. You were a good first draft.
 */

import { spawn } from 'node:child_process';
import type { MartinLoopConfig, MartinLoopResult, IterationResult } from './cli-types.js';
import type { ICliProvider } from './providers/cli-provider.js';
import { ProviderRegistry, createDefaultRegistry } from './providers/cli-provider.js';
import { tryExtractTextFromNode } from './providers/index.js';
import { createChunkSession, createChunkTranscriptEntry, type ChunkSession } from '../session/chunk-session.js';
import { classifyCommandFailure, commandFailureFromExecError, parseResetTimeText, type CommandFailure } from '../errors/command-failure.js';

type RunLoopRateLimitState = {
  readonly activeProvider: string;
  readonly pendingSleepMs: number;
  readonly chunkSession: ChunkSession | undefined;
};

export function parseResetTime(stderr: string, stdout: string): { sleepSeconds: number; source: string } {
  return parseResetTimeText(`${stderr}\n${stdout}`);
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPromiseTags(output: string): string[] {
  const matches = output.matchAll(/<promise>\s*([^<]+?)\s*<\/promise>/gi);
  return [...matches]
    .map((match) => match[1]?.trim())
    .filter((tag): tag is string => Boolean(tag && tag.length > 0));
}

function abortError(): Error {
  const error = new Error('MartinLoop sleep aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Exported for tests: regression coverage that no abort listeners leak (issue #39). */
export function sleepWithAbort(
  ms: number,
  sleepFn: (durationMs: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) return sleepFn(ms);
  if (signal.aborted) return Promise.reject(abortError());

  if (sleepFn === defaultSleep) {
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(abortError());
      };

      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    sleepFn(ms)
      .then(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      })
      .catch((error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
}

/**
 * Process a single complete line from stream-json output.
 * If it's valid JSON, extract text content. If plain text, pass through.
 * Returns empty string for non-text JSON frames or blank lines.
 */
export function processStreamLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) return '';

  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;

    // Check for thinking content (extended thinking / reasoning)
    const delta = obj.delta as Record<string, unknown> | undefined;
    if (delta?.thinking && typeof delta.thinking === 'string') {
      return `\x1b[2m${delta.thinking}\x1b[0m`;
    }

    const parts: string[] = [];
    tryExtractTextFromNode(obj, parts);
    return parts.join('');
  } catch {
    // Not JSON — pass through as plain text
    return trimmed;
  }
}

/**
 * Summarize a tool use invocation as a compact, dimmed one-liner.
 * Extracts the most useful parameter (file_path, command, pattern) from the
 * accumulated JSON input fragments.
 */
function summarizeToolUse(toolName: string, inputJson: string): string {
  let detail = '';
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    if (typeof input.file_path === 'string') {
      // Show just the basename for brevity
      const parts = (input.file_path as string).split('/');
      detail = parts[parts.length - 1] || input.file_path as string;
    } else if (typeof input.command === 'string') {
      const cmd = input.command as string;
      detail = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
    } else if (typeof input.pattern === 'string') {
      detail = input.pattern as string;
    }
  } catch {
    // Partial / malformed JSON — just show the tool name
  }
  const label = detail ? `${toolName} ${detail}` : toolName;
  return `\x1b[2m[tool] ${label}\x1b[0m`;
}

/**
 * Line-buffered processor for stream-json output.
 * Accumulates bytes until newline, then processes each complete line
 * through processStreamLine. Partial lines are held until completed.
 *
 * Tracks tool-use blocks: when a `content_block_start` with `type: "tool_use"`
 * is seen, subsequent `input_json_delta` frames are accumulated silently and a
 * compact summary is emitted on `content_block_stop`. Tool-result blocks are
 * suppressed entirely to avoid dumping file contents to the terminal.
 */
export class StreamLineBuffer {
  private buffer = '';
  /** Active tool-use block state, keyed by content_block index. */
  private activeToolUse: { index: number; name: string; inputJson: string } | null = null;
  /** Set of content_block indices that are tool_result blocks (suppressed). */
  private suppressedIndices = new Set<number>();

  /** Push raw data. Returns array of clean text strings (empty entries filtered out). */
  push(data: string): string[] {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? ''; // last element is incomplete line (or empty after trailing \n)

    const results: string[] = [];
    for (const line of lines) {
      const result = this.processLine(line);
      if (result !== null && result.length > 0) {
        results.push(result);
      }
    }
    return results;
  }

  /** Flush remaining buffer as plain text. */
  flush(): string[] {
    if (this.buffer.trim().length === 0) {
      this.buffer = '';
      return [];
    }
    const text = this.buffer.trim();
    this.buffer = '';
    return [text];
  }

  /** Process a single line with tool-use state tracking. Returns null to suppress output. */
  private processLine(line: string): string | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) return '';

    let obj: Record<string, unknown> | null = null;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Not JSON — pass through as plain text
      return trimmed;
    }

    const eventType = obj.type as string | undefined;
    const index = typeof obj.index === 'number' ? obj.index : -1;

    // ── content_block_start ──
    if (eventType === 'content_block_start') {
      const block = obj.content_block as Record<string, unknown> | undefined;
      if (block?.type === 'tool_use' && typeof block.name === 'string') {
        this.activeToolUse = { index, name: block.name as string, inputJson: '' };
        return null;
      }
      if (block?.type === 'tool_result') {
        this.suppressedIndices.add(index);
        return null;
      }
      return ''; // text block start — no visible output
    }

    // ── content_block_delta ──
    if (eventType === 'content_block_delta') {
      // Inside a tool_use block — accumulate input JSON
      if (this.activeToolUse && index === this.activeToolUse.index) {
        const delta = obj.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          this.activeToolUse.inputJson += delta.partial_json;
        }
        return null;
      }
      // Inside a tool_result block — suppress
      if (this.suppressedIndices.has(index)) {
        return null;
      }
    }

    // ── content_block_stop ──
    if (eventType === 'content_block_stop') {
      if (this.activeToolUse && index === this.activeToolUse.index) {
        const summary = summarizeToolUse(this.activeToolUse.name, this.activeToolUse.inputJson);
        this.activeToolUse = null;
        return summary;
      }
      if (this.suppressedIndices.has(index)) {
        this.suppressedIndices.delete(index);
        return null;
      }
      return '';
    }

    // Fall through to default processing
    return processStreamLine(line);
  }
}

const NO_COMMIT_CONSTRAINT = '\n\nIMPORTANT: Do NOT run git commit, git push, git tag, or any other git write commands. The orchestrator handles all commits automatically. Only read/edit files and run tests/builds.\nNEVER commit build output or generated files. These must ALWAYS be in .gitignore: dist/, node_modules/, .turbo/, coverage/, .build/, .env, *.db. If you add new tools, build steps, or dependencies that produce output, update .gitignore BEFORE doing anything else.\n\nTo signal completion, you MUST emit the promise tag exactly like this: <promise>TAG</promise> (where TAG is the promise tag provided in the prompt).\n';

function spawnIteration(
  config: MartinLoopConfig,
  provider: ICliProvider,
  promptOverride?: string,
  sessionContinue = false,
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; cleanStdout: string }> {
  return new Promise((resolve, reject) => {
    if (config.abortSignal?.aborted) {
      reject(abortError());
      return;
    }

    const cmd = config.providerCommands?.[provider.name]
      ?? (provider.name === config.provider ? config.command : undefined)
      ?? provider.command;
    const model = config.providerModels?.[provider.name]
      ?? (provider.name === config.provider ? config.model : undefined);
    const providerArgs = provider.buildArgs({
      maxTurns: config.maxTurns,
      model,
      sessionContinue,
    });
    const prompt = (promptOverride ?? config.prompt) + NO_COMMIT_CONSTRAINT;
    const args = provider.supportsStreamJson()
      ? [...providerArgs, '--', prompt]
      : [...providerArgs, prompt];

    const env = provider.filterEnv(process.env as Record<string, string>);

    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: config.workingDir,
      env,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let aborted = false;
    let timedOut = false;
    const cleanParts: string[] = [];
    const streamBuffer = provider.supportsStreamJson() ? new StreamLineBuffer() : null;

    const finish = (result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean; cleanStdout: string }): void => {
      if (settled) return;
      settled = true;
      config.abortSignal?.removeEventListener('abort', onAbort);
      if (aborted) {
        reject(abortError());
        return;
      }
      resolve(result);
    };

    child.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Stream output to terminal so the user can see the agent working
      if (streamBuffer) {
        const lines = streamBuffer.push(text);
        for (const line of lines) {
          cleanParts.push(line);
          process.stdout.write(line + '\n');
        }
      } else {
        cleanParts.push(text);
        process.stdout.write(text);
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      // stderr is captured for build.log via onIteration callback — not piped
      // to terminal (too noisy with --verbose). Errors surface via logger.
    });

    // Timeout: SIGTERM first, then SIGKILL after 5s
    const escalationTimers: NodeJS.Timeout[] = [];
    const timer = setTimeout(() => {
      timedOut = true;
      config.onProviderTimeout?.(provider.name, config.timeoutMs);
      child.kill('SIGTERM');
      escalationTimers.push(setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5_000));
      // Hard fail-safe: if process still hasn't closed, force resolution.
      escalationTimers.push(setTimeout(() => {
        if (streamBuffer) {
          const remaining = streamBuffer.flush();
          for (const line of remaining) cleanParts.push(line);
        }
        finish({
          stdout,
          stderr: `${stderr}\n[MartinLoop] iteration timed out after ${config.timeoutMs}ms`,
          exitCode: 124,
          timedOut: true,
          cleanStdout: cleanParts.join('\n'),
        });
      }, 7_000));
    }, config.timeoutMs);

    // Clear the timeout and any pending kill-escalation timers so a settled
    // iteration does not keep the child and its buffers alive for up to 7s.
    const clearTimers = (): void => {
      clearTimeout(timer);
      for (const t of escalationTimers) clearTimeout(t);
      escalationTimers.length = 0;
    };

    const clearProviderTimeout = (): void => {
      clearTimeout(timer);
    };

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      config.abortSignal?.removeEventListener('abort', onAbort);
      reject(err);
    };

    const onAbort = (): void => {
      aborted = true;
      clearProviderTimeout();
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      escalationTimers.push(setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5_000));
      escalationTimers.push(setTimeout(() => {
        if (streamBuffer) {
          const remaining = streamBuffer.flush();
          for (const line of remaining) cleanParts.push(line);
        }
        clearTimers();
        finish({
          stdout,
          stderr: `${stderr}\n[MartinLoop] iteration aborted`,
          exitCode: 130,
          timedOut,
          cleanStdout: cleanParts.join('\n'),
        });
      }, 7_000));
    };
    config.abortSignal?.addEventListener('abort', onAbort, { once: true });

    child.on('close', (code) => {
      clearTimers();
      if (streamBuffer) {
        const remaining = streamBuffer.flush();
        for (const line of remaining) cleanParts.push(line);
      }
      finish({ stdout, stderr, exitCode: code ?? 1, timedOut, cleanStdout: cleanParts.join('\n') });
    });

    child.on('error', (err) => {
      fail(err);
    });
  });
}

export class MartinLoop {
  private readonly registry: ProviderRegistry;

  constructor(registry?: ProviderRegistry) {
    this.registry = registry ?? createDefaultRegistry();
  }

  async run(config: MartinLoopConfig): Promise<MartinLoopResult> {
    const providers: readonly string[] =
      config.providers && config.providers.length > 0
        ? config.providers
        : ['claude', 'codex'];
    const sleepFn = config._sleepFn ?? defaultSleep;
    const initialProvider = config.provider;

    let iteration = 0;
    let lastOutput = '';
    let totalTokens = 0;
    let activeProvider: string = config.provider;
    let pendingSleepMs = 0;
    let lastEmittedPromiseTags: string[] = [];
    const promiseRegex = new RegExp(`<promise>\\s*${escapeRegex(config.promiseTag)}\\s*</promise>`, 'i');
    let chunkSession = this.loadOrCreateChunkSession(config, activeProvider);

    // Provider exhaustion tracking
    const exhaustedProviders = new Map<string, CommandFailure>();

    while (iteration < config.maxIterations) {
      iteration++;
      const startTime = wallClockNow();

      const resolved = this.registry.get(activeProvider);
      let renderedPrompt = config.prompt;
      let sessionContinue = false;

      if (chunkSession && config.renderer) {
        const rendered = config.renderer.render(chunkSession, resolved);
        renderedPrompt = rendered.prompt;
        sessionContinue = rendered.sessionContinue;
      }

      config.onProviderAttempt?.(activeProvider, iteration, renderedPrompt);

      let result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean; cleanStdout: string };
      try {
        result = await spawnIteration(config, resolved, renderedPrompt, sessionContinue);
      } catch (error) {
        if (config.abortSignal?.aborted) {
          throw config.abortSignal.reason instanceof Error ? config.abortSignal.reason : abortError();
        }
        if (isAbortError(error)) {
          throw error;
        }
        const failure = commandFailureFromExecError({
          tool: 'llm',
          provider: activeProvider,
          command: resolved.command,
          error,
          detectRateLimit: (text) => resolved.isRateLimited(text),
          parseRetryAfterMs: (text) => {
            const providerMs = resolved.parseRetryAfter(text);
            if (providerMs !== undefined) {
              return providerMs;
            }
            const parsed = parseResetTimeText(text);
            return parsed.sleepSeconds >= 0 ? parsed.sleepSeconds * 1000 : undefined;
          },
        });
        const msg = error instanceof Error ? error.message : String(error);
        config.onSpawnError?.(activeProvider, msg);
        if (config.abortSignal?.aborted) {
          throw config.abortSignal.reason instanceof Error ? config.abortSignal.reason : abortError();
        }
        if (failure.kind === 'spawn_error') {
          iteration--;
          exhaustedProviders.set(activeProvider, failure);
          const nextProvider = providers.find(p => !exhaustedProviders.has(p));
          if (nextProvider) {
            config.onProviderSwitch?.(activeProvider, nextProvider, 'spawn-error');
            activeProvider = nextProvider;
            if (chunkSession) {
              chunkSession = {
                ...chunkSession,
                activeProvider,
                updatedAt: isoNow(),
              };
              config.sessionStore?.save(chunkSession);
            }
            continue;
          }

          const rateLimitedFailures = [...exhaustedProviders.entries()]
            .filter(([, data]) => data.rateLimited);
          if (rateLimitedFailures.length > 0) {
            let shortestSleep = Infinity;
            let shortestSource = 'unknown';
            for (const [providerName, data] of rateLimitedFailures) {
              if (data.retryAfterMs !== undefined) {
                const sleepSeconds = data.retryAfterMs / 1000;
                if (sleepSeconds >= 0 && sleepSeconds < shortestSleep) {
                  shortestSleep = sleepSeconds;
                  shortestSource = `${providerName} parseRetryAfter`;
                }
                continue;
              }

              const parsed = parseResetTime(data.stderr, data.stdout);
              if (parsed.sleepSeconds >= 0 && parsed.sleepSeconds < shortestSleep) {
                shortestSleep = parsed.sleepSeconds;
                shortestSource = parsed.source;
              }
            }

            const sleepMs = shortestSleep === Infinity ? 120_000 : shortestSleep * 1000;
            const sleepSource = shortestSleep === Infinity ? 'unknown' : shortestSource;
            config.onSleep?.(sleepMs, sleepSource);
            await sleepWithAbort(sleepMs, sleepFn, config.abortSignal);
            pendingSleepMs = sleepMs;
            exhaustedProviders.clear();
            if (activeProvider !== initialProvider) {
              config.onProviderSwitch?.(activeProvider, initialProvider, 'post-sleep-reset');
            }
            activeProvider = initialProvider;
            if (chunkSession) {
              chunkSession = {
                ...chunkSession,
                activeProvider,
                updatedAt: isoNow(),
              };
              config.sessionStore?.save(chunkSession);
            }
            continue;
          }

          throw new Error(
            `No configured LLM provider CLI is available. Install or configure one of: ${providers.join(', ')}. Last error: ${failure.summary}`,
          );
        }
        continue;
      }

      if (config.abortSignal?.aborted) {
        throw config.abortSignal.reason instanceof Error ? config.abortSignal.reason : abortError();
      }

      const durationMs = wallClockNow() - startTime;
      // For stream-json providers, use the pre-cleaned output from StreamLineBuffer.
      // For non-stream-json providers, normalize the raw stdout via the provider.
      const normalizedStdout = resolved.supportsStreamJson()
        ? result.cleanStdout
        : resolved.normalizeOutput(result.stdout);
      lastOutput = normalizedStdout;

      const tokensEstimated = resolved.estimateTokens(normalizedStdout);
      totalTokens += tokensEstimated;
      const emittedPromiseTags = extractPromiseTags(normalizedStdout);
      lastEmittedPromiseTags = emittedPromiseTags;

      // Never treat timed-out iterations as rate-limited — the timeout killed the
      // process, any "rate limit" text in stdout is the model's code, not an API error.
      const failure = result.exitCode === 0
        ? undefined
        : classifyCommandFailure({
          tool: 'llm',
          provider: activeProvider,
          command: resolved.command,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          stdout: result.stdout,
          stderr: result.stderr,
          normalizedOutput: normalizedStdout,
          detectRateLimit: (text) => resolved.isRateLimited(text),
          parseRetryAfterMs: (text) => {
            const providerMs = resolved.parseRetryAfter(text);
            if (providerMs !== undefined) {
              return providerMs;
            }
            const parsed = parseResetTimeText(text);
            return parsed.sleepSeconds >= 0 ? parsed.sleepSeconds * 1000 : undefined;
          },
        });
      const rateLimited = failure?.rateLimited ?? false;
      const promiseDetected = promiseRegex.test(normalizedStdout);

      const iterResult: IterationResult = {
        iteration,
        provider: activeProvider,
        exitCode: result.exitCode,
        stdout: normalizedStdout,
        stderr: result.stderr,
        durationMs,
        rateLimited,
        promiseDetected,
        emittedPromiseTags,
        tokensEstimated,
        sleepMs: pendingSleepMs,
        ...(failure ? { failure } : {}),
      };

      // Reset pendingSleepMs after reporting it
      pendingSleepMs = 0;

      config.onIteration?.(iteration, iterResult);

      chunkSession = await this.persistIterationSession({
        chunkSession,
        activeProvider,
        normalizedStdout,
        iteration,
        renderedPrompt,
        resolved,
        config,
      });

      // Rate limit: provider fallback chain
      if (rateLimited) {
        iteration--;
        const nextState = await this.handleRateLimitedIteration({
          config,
          providers,
          initialProvider,
          activeProvider,
          failure: failure!,
          exhaustedProviders,
          chunkSession,
          sleepFn,
        });
        activeProvider = nextState.activeProvider;
        pendingSleepMs = nextState.pendingSleepMs;
        chunkSession = nextState.chunkSession;
        continue;
      }

      // Promise detected — verify meaningful output
      if (promiseDetected) {
        return this.finalizePromiseDetectedIteration({
          normalizedStdout,
          promiseRegex,
          iteration,
          lastOutput,
          totalTokens,
          lastEmittedPromiseTags,
        });
      }
    }

    return {
      completed: false,
      iterations: iteration,
      output: lastOutput,
      tokensUsed: totalTokens,
      emittedPromiseTags: lastEmittedPromiseTags,
    };
  }




  private finalizePromiseDetectedIteration(options: {
    readonly normalizedStdout: string;
    readonly promiseRegex: RegExp;
    readonly iteration: number;
    readonly lastOutput: string;
    readonly totalTokens: number;
    readonly lastEmittedPromiseTags: readonly string[];
  }): MartinLoopResult {
    const { normalizedStdout, promiseRegex, iteration, lastOutput, totalTokens, lastEmittedPromiseTags } = options;
    const stripped = normalizedStdout.replace(promiseRegex, '').trim();
    if (stripped.length === 0) {
      return {
        completed: false,
        iterations: iteration,
        output: lastOutput,
        tokensUsed: totalTokens,
        emittedPromiseTags: lastEmittedPromiseTags,
      };
    }
    return {
      completed: true,
      iterations: iteration,
      output: lastOutput,
      tokensUsed: totalTokens,
      emittedPromiseTags: lastEmittedPromiseTags,
    };
  }

  private async persistIterationSession(options: {
    readonly chunkSession: ChunkSession | undefined;
    readonly activeProvider: string;
    readonly normalizedStdout: string;
    readonly iteration: number;
    readonly renderedPrompt: string;
    readonly resolved: ICliProvider;
    readonly config: MartinLoopConfig;
  }): Promise<ChunkSession | undefined> {
    const { chunkSession, activeProvider, normalizedStdout, iteration, renderedPrompt, resolved, config } = options;
    if (!chunkSession) return undefined;

    let nextSession = this.appendIterationOutput(chunkSession, activeProvider, normalizedStdout, iteration);

    if (config.contextUsage) {
      const usage = config.contextUsage(renderedPrompt, activeProvider, resolved.defaultContextWindowTokens());
      nextSession = {
        ...nextSession,
        contextWindow: {
          ...nextSession.contextWindow,
          provider: activeProvider,
          usedTokens: usage.usedTokens,
          maxTokens: usage.maxTokens,
          usageRatio: usage.usageRatio,
          compactThreshold: usage.threshold,
        },
        updatedAt: isoNow(),
      };
    }

    config.sessionStore?.save(nextSession);

    if (
      config.contextUsage &&
      config.snapshotStore &&
      config.compactor &&
      nextSession.contextWindow.usageRatio >= nextSession.contextWindow.compactThreshold
    ) {
      config.snapshotStore.writeSnapshot(nextSession, 'pre-compaction');
      nextSession = await config.compactor.compact(nextSession);
      config.sessionStore?.save(nextSession);
    }

    return nextSession;
  }

  private async handleRateLimitedIteration(options: {
    readonly config: MartinLoopConfig;
    readonly providers: readonly string[];
    readonly initialProvider: string;
    readonly activeProvider: string;
    readonly failure: CommandFailure;
    readonly exhaustedProviders: Map<string, CommandFailure>;
    readonly chunkSession: ChunkSession | undefined;
    readonly sleepFn: (durationMs: number) => Promise<void>;
  }): Promise<RunLoopRateLimitState> {
    const {
      config,
      providers,
      initialProvider,
      activeProvider,
      failure,
      exhaustedProviders,
      chunkSession,
      sleepFn,
    } = options;

    config.onRateLimit?.(activeProvider);
    exhaustedProviders.set(activeProvider, failure);

    const nextProvider = providers.find(p => !exhaustedProviders.has(p));
    if (nextProvider) {
      config.onProviderSwitch?.(activeProvider, nextProvider, 'rate-limit');
      return {
        activeProvider: nextProvider,
        pendingSleepMs: 0,
        chunkSession: this.updateChunkSessionProvider(chunkSession, nextProvider, config),
      };
    }

    const { sleepMs, sleepSource } = this.resolveProviderExhaustionSleep(exhaustedProviders);
    config.onSleep?.(sleepMs, sleepSource);
    await sleepWithAbort(sleepMs, sleepFn, config.abortSignal);

    exhaustedProviders.clear();
    if (activeProvider !== initialProvider) {
      config.onProviderSwitch?.(activeProvider, initialProvider, 'post-sleep-reset');
    }

    return {
      activeProvider: initialProvider,
      pendingSleepMs: sleepMs,
      chunkSession: this.updateChunkSessionProvider(chunkSession, initialProvider, config),
    };
  }

  private resolveProviderExhaustionSleep(exhaustedProviders: Map<string, CommandFailure>): {
    readonly sleepMs: number;
    readonly sleepSource: string;
  } {
    let shortestSleep = Infinity;
    let shortestSource = 'unknown';

    for (const [providerName, data] of exhaustedProviders) {
      if (data.retryAfterMs !== undefined) {
        const sleepSeconds = data.retryAfterMs / 1000;
        if (sleepSeconds >= 0 && sleepSeconds < shortestSleep) {
          shortestSleep = sleepSeconds;
          shortestSource = `${providerName} parseRetryAfter`;
        }
        continue;
      }

      const parsed = parseResetTime(data.stderr, data.stdout);
      if (parsed.sleepSeconds >= 0 && parsed.sleepSeconds < shortestSleep) {
        shortestSleep = parsed.sleepSeconds;
        shortestSource = parsed.source;
      }
    }

    if (shortestSleep !== Infinity) {
      return { sleepMs: shortestSleep * 1000, sleepSource: shortestSource };
    }

    const rawStderrs = [...exhaustedProviders.entries()]
      .map(([p, d]) => `${p}: ${d.stderr}`)
      .join(' | ');
    console.warn(`[MartinLoop] Rate limit reset time could not be determined. Raw stderr: ${rawStderrs}`);
    return { sleepMs: 120_000, sleepSource: 'unknown' };
  }

  private updateChunkSessionProvider(
    chunkSession: ChunkSession | undefined,
    activeProvider: string,
    config: MartinLoopConfig,
  ): ChunkSession | undefined {
    if (!chunkSession) return undefined;
    const updated = {
      ...chunkSession,
      activeProvider,
      updatedAt: isoNow(),
    };
    config.sessionStore?.save(updated);
    return updated;
  }

  private loadOrCreateChunkSession(config: MartinLoopConfig, providerName: string): ChunkSession | undefined {
    if (!config.sessionStore || !config.planName || !config.chunkId || !config.taskId) {
      return undefined;
    }

    const existing = config.sessionStore.load(config.planName, config.chunkId, config.taskId);
    if (existing) {
      return existing;
    }

    const session = createChunkSession({
      planName: config.planName,
      taskId: config.taskId,
      chunkId: config.chunkId,
      promiseTag: config.promiseTag,
      workingDir: config.workingDir ?? process.cwd(),
      provider: providerName,
      maxTokens: this.registry.get(providerName).defaultContextWindowTokens(),
    });

    const seeded: ChunkSession = {
      ...session,
      transcript: [createChunkTranscriptEntry('objective', config.prompt)],
    };
    config.sessionStore.save(seeded);
    return seeded;
  }

  private appendIterationOutput(
    session: ChunkSession,
    providerName: string,
    output: string,
    iteration: number,
  ): ChunkSession {
    return {
      ...session,
      iterations: iteration,
      activeProvider: providerName,
      transcript: [...session.transcript, createChunkTranscriptEntry('assistant', output)],
      updatedAt: isoNow(),
    };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
