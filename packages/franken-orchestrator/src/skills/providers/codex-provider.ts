/**
 * Codex CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildCodexArgs, normalizeCodexOutput,
 * tryExtractTextFromNode.
 */

import type { TokenUsage } from '@franken/types';
import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, BASE_RATE_LIMIT_PATTERNS, extractNdjsonTokenUsage } from './stream-json-utils.js';
import { sanitizeRunConfigIntegrityEnv } from '../../cli/run-config-integrity.js';
import { resolveCodexSandboxArgs } from '../../providers/codex-args.js';

const RATE_LIMIT_PATTERNS = BASE_RATE_LIMIT_PATTERNS;

export class CodexProvider implements ICliProvider {
  readonly name = 'codex';
  readonly command = 'codex';

  buildArgs(opts: ProviderOpts): string[] {
    const { sandboxArgs, extraArgs } = resolveCodexSandboxArgs(opts.extraArgs);
    const args: string[] = ['exec', ...sandboxArgs, '--json', '--color', 'never'];
    if (opts.chatMode && !extraArgs.includes('--skip-git-repo-check')) {
      args.push('--skip-git-repo-check');
    }
    if (opts.model) {
      args.push('--model', opts.model);
    }
    args.push(...extraArgs);
    return args;
  }

  normalizeOutput(raw: string): string {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const extracted: string[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as unknown;
        tryExtractTextFromNode(parsed, extracted);
        if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
          tryExtractTextFromNode((parsed as { error: unknown }).error, errors);
        }
      } catch {
        extracted.push(line);
      }
    }

    return (extracted.length > 0 ? extracted : errors).join('\n').trim();
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 16);
  }

  extractUsage(raw: string): TokenUsage | undefined {
    return extractNdjsonTokenUsage(raw);
  }

  isRateLimited(stderr: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string): number | undefined {
    // "resets in 30s"
    const resetsInMatch = stderr.match(/resets?\s+in\s+(\d+)\s*s/i);
    if (resetsInMatch?.[1]) {
      return parseInt(resetsInMatch[1], 10) * 1000;
    }

    // "retry-after: 30"
    const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)\s*s?/i);
    if (retryAfterMatch?.[1]) {
      return parseInt(retryAfterMatch[1], 10) * 1000;
    }

    return undefined;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    return {
      ...sanitizeRunConfigIntegrityEnv(env),
      FRANKENBEAST_SPAWNED: '1',
    };
  }

  supportsStreamJson(): boolean {
    return false;
  }

  supportsNativeSessionResume(): boolean {
    return false;
  }

  defaultContextWindowTokens(): number {
    return 128_000;
  }

  getCacheCapabilities() {
    return {
      nativeWorkSessions: false,
      persistentAcrossProcesses: false,
      promptReuse: 'managed' as const,
    };
  }
}
