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

export function parseResetTime(stderr: string, stdout: string): { sleepSeconds: number; source: string } {
  const combined = `${stderr}\n${stdout}`;

  // Anthropic "retry-after: 30" header
  const retryAfterHeaderMatch = combined.match(/retry.?after:?\s*(\d+)\s*s?/i);
  if (retryAfterHeaderMatch?.[1]) {
    return { sleepSeconds: parseInt(retryAfterHeaderMatch[1], 10), source: 'retry-after header' };
  }

  // "Please retry after 25s"
  const retryAfterPatternMatch = combined.match(/retry.?after\s+(\d+)\s*s?/i);
  if (retryAfterPatternMatch?.[1]) {
    return { sleepSeconds: parseInt(retryAfterPatternMatch[1], 10), source: 'retry-after header' };
  }

  // "try again in 5 minutes" / "try again in 30 seconds"
  const minutesMatch = combined.match(/try again in (\d+) minute/i);
  if (minutesMatch?.[1]) return { sleepSeconds: parseInt(minutesMatch[1], 10) * 60, source: 'minutes pattern' };
  const secondsMatch = combined.match(/try again in (\d+) second/i);
  if (secondsMatch?.[1]) return { sleepSeconds: parseInt(secondsMatch[1], 10), source: 'seconds pattern' };

  // "rate limit resets at 2026-03-05T20:15:00Z" or epoch timestamp
  const isoMatch = combined.match(/resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
  if (isoMatch?.[1]) {
    const resetAt = new Date(isoMatch[1]).getTime();
    const now = Date.now();
    if (resetAt > now) return { sleepSeconds: Math.ceil((resetAt - now) / 1000), source: 'reset-at timestamp' };
  }

  // "x-ratelimit-reset: <epoch>" header
  const epochMatch = combined.match(/x-ratelimit-reset:\s*(\d{10,13})/i);
  if (epochMatch?.[1]) {
    const epoch = parseInt(epochMatch[1], 10);
    const resetMs = epoch > 1e12 ? epoch : epoch * 1000;
    const now = Date.now();
    if (resetMs > now) return { sleepSeconds: Math.ceil((resetMs - now) / 1000), source: 'x-ratelimit-reset epoch' };
  }

  // OpenAI / Codex "resets in Ns"
  const resetsInMatch = combined.match(/resets?\s+in\s+(\d+)\s*s/i);
  if (resetsInMatch?.[1]) return { sleepSeconds: parseInt(resetsInMatch[1], 10), source: 'resets-in pattern' };

  // No parseable reset time
  return { sleepSeconds: -1, source: 'unknown' };
}

function defaultSleep(ms: number): Promise<void> {
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

function sleepWithAbort(
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
    const cmd = config.command ?? provider.command;
    const providerArgs = provider.buildArgs({ maxTurns: config.maxTurns, sessionContinue });
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
    let timedOut = false;
    const cleanParts: string[] = [];
    const streamBuffer = provider.supportsStreamJson() ? new StreamLineBuffer() : null;

    const finish = (result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean; cleanStdout: string }): void => {
      if (settled) return;
      settled = true;
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
    const timer = setTimeout(() => {
      timedOut = true;
      config.onProviderTimeout?.(provider.name, config.timeoutMs);
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5_000);
      // Hard fail-safe: if process still hasn't closed, force resolution.
      setTimeout(() => {
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
      }, 7_000);
    }, config.timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (streamBuffer) {
        const remaining = streamBuffer.flush();
        for (const line of remaining) cleanParts.push(line);
      }
      finish({ stdout, stderr, exitCode: code ?? 1, timedOut, cleanStdout: cleanParts.join('\n') });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
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
    const exhaustedProviders = new Map<string, { stderr: string; stdout: string }>();

    while (iteration < config.maxIterations) {
      iteration++;
      const startTime = Date.now();

      const resolved = this.registry.get(activeProvider);
      config.onProviderAttempt?.(activeProvider, iteration);
      let renderedPrompt = config.prompt;
      let sessionContinue = false;

      if (chunkSession && config.renderer) {
        const rendered = config.renderer.render(chunkSession, resolved);
        renderedPrompt = rendered.prompt;
        sessionContinue = rendered.sessionContinue;
      }

      let result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean; cleanStdout: string };
      try {
        result = await spawnIteration(config, resolved, renderedPrompt, sessionContinue);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        config.onSpawnError?.(activeProvider, msg);
        continue;
      }

      const durationMs = Date.now() - startTime;
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
      const rateLimited = !result.timedOut && resolved.isRateLimited(result.stderr);
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
      };

      // Reset pendingSleepMs after reporting it
      pendingSleepMs = 0;

      config.onIteration?.(iteration, iterResult);

      if (chunkSession) {
        chunkSession = this.appendIterationOutput(chunkSession, activeProvider, normalizedStdout, iteration);

        if (config.contextUsage) {
          const usage = config.contextUsage(renderedPrompt, activeProvider, resolved.defaultContextWindowTokens());
          chunkSession = {
            ...chunkSession,
            contextWindow: {
              ...chunkSession.contextWindow,
              provider: activeProvider,
              usedTokens: usage.usedTokens,
              maxTokens: usage.maxTokens,
              usageRatio: usage.usageRatio,
              compactThreshold: usage.threshold,
            },
            updatedAt: new Date().toISOString(),
          };
        }

        config.sessionStore?.save(chunkSession);

        if (
          config.contextUsage &&
          config.snapshotStore &&
          config.compactor &&
          chunkSession.contextWindow.usageRatio >= chunkSession.contextWindow.compactThreshold
        ) {
          config.snapshotStore.writeSnapshot(chunkSession, 'pre-compaction');
          chunkSession = await config.compactor.compact(chunkSession);
          config.sessionStore?.save(chunkSession);
        }
      }

      // Rate limit: provider fallback chain
      if (rateLimited) {
        iteration--;

        // Notify via legacy callback (non-controlling)
        config.onRateLimit?.(activeProvider);

        // Track this provider as exhausted
        exhaustedProviders.set(activeProvider, { stderr: result.stderr, stdout: normalizedStdout });

        // Find next non-exhausted provider
        const nextProvider = providers.find(p => !exhaustedProviders.has(p));

        if (nextProvider) {
          // Switch to next provider, retry immediately
          config.onProviderSwitch?.(activeProvider, nextProvider, 'rate-limit');
          activeProvider = nextProvider;
          if (chunkSession) {
            chunkSession = {
              ...chunkSession,
              activeProvider,
              updatedAt: new Date().toISOString(),
            };
            config.sessionStore?.save(chunkSession);
          }
          continue;
        }

        // All providers exhausted — parse reset times and sleep
        let shortestSleep = Infinity;
        let shortestSource = 'unknown';

        for (const [providerName, data] of exhaustedProviders) {
          const providerImpl = this.registry.get(providerName);
          const retryMs = providerImpl.parseRetryAfter(data.stderr);

          if (retryMs !== undefined) {
            // Provider-specific parsing succeeded (returns milliseconds)
            const sleepSeconds = retryMs / 1000;
            if (sleepSeconds >= 0 && sleepSeconds < shortestSleep) {
              shortestSleep = sleepSeconds;
              shortestSource = `${providerName} parseRetryAfter`;
            }
          } else {
            // Fallback to generic parseResetTime
            const parsed = parseResetTime(data.stderr, data.stdout);
            if (parsed.sleepSeconds >= 0 && parsed.sleepSeconds < shortestSleep) {
              shortestSleep = parsed.sleepSeconds;
              shortestSource = parsed.source;
            }
          }
        }

        let sleepMs: number;
        let sleepSource: string;

        if (shortestSleep === Infinity) {
          // No parseable reset time — fallback to 120s
          sleepMs = 120_000;
          sleepSource = 'unknown';
          // Log warning with raw stderr so user can see what the API said
          const rawStderrs = [...exhaustedProviders.entries()]
            .map(([p, d]) => `${p}: ${d.stderr}`)
            .join(' | ');
          console.warn(`[MartinLoop] Rate limit reset time could not be determined. Raw stderr: ${rawStderrs}`);
        } else {
          sleepMs = shortestSleep * 1000;
          sleepSource = shortestSource;
        }

        // Fire onSleep before sleeping
        config.onSleep?.(sleepMs, sleepSource);

        // Sleep until reset (abort-aware so SIGINT can interrupt long waits)
        await sleepWithAbort(sleepMs, sleepFn, config.abortSignal);

        // Track the sleep duration for the next iteration's report
        pendingSleepMs = sleepMs;

        // Clear exhausted state, reset to original provider
        exhaustedProviders.clear();
        if (activeProvider !== initialProvider) {
          config.onProviderSwitch?.(activeProvider, initialProvider, 'post-sleep-reset');
        }
        activeProvider = initialProvider;
        if (chunkSession) {
          chunkSession = {
            ...chunkSession,
            activeProvider,
            updatedAt: new Date().toISOString(),
          };
          config.sessionStore?.save(chunkSession);
        }
        continue;
      }

      // Promise detected — verify meaningful output
      if (promiseDetected) {
        const stripped = normalizedStdout.replace(promiseRegex, '').trim();
        if (stripped.length === 0) {
          // Promise without meaningful changes — reject
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
    }

    return {
      completed: false,
      iterations: iteration,
      output: lastOutput,
      tokensUsed: totalTokens,
      emittedPromiseTags: lastEmittedPromiseTags,
    };
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
      updatedAt: new Date().toISOString(),
    };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
