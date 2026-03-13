/**
 * Codex CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildCodexArgs, normalizeCodexOutput,
 * tryExtractTextFromNode.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, BASE_RATE_LIMIT_PATTERNS } from './stream-json-utils.js';

const RATE_LIMIT_PATTERNS = BASE_RATE_LIMIT_PATTERNS;

export class CodexProvider implements ICliProvider {
  readonly name = 'codex';
  readonly command = 'codex';
  readonly chatModel = 'codex-mini';

  buildArgs(opts: ProviderOpts): string[] {
    const args: string[] = ['exec', '--full-auto', '--json', '--color', 'never'];
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const extracted: string[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as unknown;
        const parts: string[] = [];
        tryExtractTextFromNode(parsed, parts);
        if (parts.length > 0) {
          extracted.push(parts.join(''));
        } else if (Array.isArray(parsed)) {
          // If valid JSON array but no text extracted (e.g. raw array from triage),
          // preserve the original line. We avoid preserving objects to skip structural frames.
          extracted.push(line);
        }
      } catch {
        extracted.push(line);
      }
    }

    return extracted.join('\n').trim();
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 16);
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
    return { ...env };
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
}
