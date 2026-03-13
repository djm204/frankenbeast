/**
 * Gemini CLI provider implementation.
 *
 * NEW provider — follows design doc patterns.
 * Uses stream-json output format like Claude.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, parseCommonRetryAfterMs, collapseWhitespace } from './stream-json-utils.js';

// Gemini adds RESOURCE_EXHAUSTED to the shared base patterns
const RATE_LIMIT_PATTERNS =
  /RESOURCE_EXHAUSTED|rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;

export class GeminiProvider implements ICliProvider {
  readonly name = 'gemini';
  readonly command = 'gemini';
  readonly chatModel = 'gemini-2.0-flash';

  buildArgs(opts: ProviderOpts): string[] {
    const args: string[] = ['-p', '', '--yolo', '--output-format', 'stream-json'];
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
        const obj = JSON.parse(trimmed) as any;
        const parts: string[] = [];
        tryExtractTextFromNode(obj, parts);
        
        if (parts.length > 0) {
          extracted.push(parts.join(''));
        } else if (Array.isArray(obj) || (typeof obj === 'object' && obj !== null && !obj.type)) {
          // If it's valid JSON (array or non-structural object) but no text was extracted,
          // it's likely raw data (like triage results or config blocks). Preserve it.
          extracted.push(trimmed);
        }
      } catch {
        extracted.push(trimmed);
      }
    }

    return collapseWhitespace(extracted.join('\n').trim());
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  isRateLimited(stderr: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string): number | undefined {
    return parseCommonRetryAfterMs(stderr);
  }

  filterEnv(env: Record<string, string>): Record<string, string> {
    const filtered = { ...env };
    for (const key of Object.keys(filtered)) {
      if (key.startsWith('GEMINI') || key.startsWith('GOOGLE')) {
        delete filtered[key];
      }
    }
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
}
