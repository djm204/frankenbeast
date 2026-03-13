/**
 * Codex CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildCodexArgs, normalizeCodexOutput,
 * tryExtractTextFromNode.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, BASE_RATE_LIMIT_PATTERNS, parseCommonRetryAfterMs, collapseWhitespace } from './stream-json-utils.js';

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
        const parsed = JSON.parse(line) as any;
        const parts: string[] = [];
        tryExtractTextFromNode(parsed, parts);
        
        if (parts.length > 0) {
          extracted.push(parts.join(''));
        } else if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null && !parsed.type)) {
          // Preserve valid JSON that isn't a structural frame (no 'type' field)
          extracted.push(line);
        }
      } catch {
        extracted.push(line);
      }
    }

    return collapseWhitespace(extracted.join('\n').trim());
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 16);
  }

  isRateLimited(stderr: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string): number | undefined {
    return parseCommonRetryAfterMs(stderr);
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
