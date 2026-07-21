/**
 * Gemini CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Uses stream-json output format like Claude.
 */

import type { TokenUsage } from '@franken/types';
import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, extractNdjsonTokenUsage } from './stream-json-utils.js';
import { sanitizeRunConfigIntegrityEnv } from '../../cli/run-config-integrity.js';

// Gemini adds RESOURCE_EXHAUSTED to the shared base patterns
const RATE_LIMIT_PATTERNS =
  /RESOURCE_EXHAUSTED|rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;

// Match MartinLoop's safe fallback instead of allowing provider stderr to request a longer pause.
const MAX_GEMINI_RETRY_AFTER_MS = 120_000;

function parseBoundedRetryAfterMs(secondsText: string): number {
  const seconds = Number.parseInt(secondsText, 10);
  const maxSeconds = MAX_GEMINI_RETRY_AFTER_MS / 1000;
  if (!Number.isFinite(seconds) || seconds >= maxSeconds) {
    return MAX_GEMINI_RETRY_AFTER_MS;
  }
  return seconds * 1000;
}

export class GeminiProvider implements ICliProvider {
  readonly name = 'gemini';
  readonly command = 'gemini';
  // Flagship (Pro) tier, not the cheaper/faster Flash line — see the
  // ICliProvider.chatModel doc. Not empirically verified against a live
  // `gemini` CLI in this environment (no authenticated session available);
  // based on the current public Gemini model line.
  readonly chatModel = 'gemini-2.5-pro';

  buildArgs(opts: ProviderOpts): string[] {
    const args: string[] = ['-p', '', '--yolo', '--output-format', 'stream-json'];
    if (opts.model) {
      args.push('--model', opts.model);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    const lines = raw.split('\n');
    const extracted: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      try {
        const obj = JSON.parse(trimmed) as unknown;
        const parts: string[] = [];
        tryExtractTextFromNode(obj, parts);
        if (parts.length > 0) {
          extracted.push(parts.join(''));
        }
      } catch {
        extracted.push(trimmed);
      }
    }

    return extracted.join('\n').trim();
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  extractUsage(raw: string): TokenUsage | undefined {
    return extractNdjsonTokenUsage(raw);
  }

  isRateLimited(stderr: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string): number | undefined {
    // "retry-after: 60"
    const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)\s*s?/i);
    if (retryAfterMatch?.[1]) {
      return parseBoundedRetryAfterMs(retryAfterMatch[1]);
    }

    // "retry after 25s"
    const retryAfterPatternMatch = stderr.match(/retry.?after\s+(\d+)\s*s?/i);
    if (retryAfterPatternMatch?.[1]) {
      return parseBoundedRetryAfterMs(retryAfterPatternMatch[1]);
    }

    // "resets in 30s"
    const resetsInMatch = stderr.match(/resets?\s+in\s+(\d+)\s*s/i);
    if (resetsInMatch?.[1]) {
      return parseBoundedRetryAfterMs(resetsInMatch[1]);
    }

    return undefined;
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = sanitizeRunConfigIntegrityEnv(env);
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('GEMINI') || key.startsWith('GOOGLE')) {
        delete filtered[key];
      }
    }
    filtered['FRANKENBEAST_SPAWNED'] = '1';
    return filtered;
  }

  supportsStreamJson(): boolean {
    return true;
  }

  supportsNativeSessionResume(): boolean {
    return false;
  }

  defaultContextWindowTokens(): number {
    return 1_048_576;
  }

  getCacheCapabilities() {
    return {
      nativeWorkSessions: false,
      persistentAcrossProcesses: false,
      promptReuse: 'managed' as const,
    };
  }
}
