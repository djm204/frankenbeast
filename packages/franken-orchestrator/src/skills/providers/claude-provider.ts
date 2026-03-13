/**
 * Claude CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildClaudeArgs, RATE_LIMIT_PATTERNS,
 * parseResetTime, and env filtering logic.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, stripHookJson, BASE_RATE_LIMIT_PATTERNS, parseCommonRetryAfterMs, collapseWhitespace } from './stream-json-utils.js';

// Re-export for backward compatibility (used by providers/index.ts)
export { tryExtractTextFromNode } from './stream-json-utils.js';

const RATE_LIMIT_PATTERNS = BASE_RATE_LIMIT_PATTERNS;

export class ClaudeProvider implements ICliProvider {
  readonly name = 'claude';
  readonly command = 'claude';
  readonly chatModel = 'claude-sonnet-4-6';

  buildArgs(opts: ProviderOpts): string[] {
    // chatMode and chunk-session continuation can both use native CLI resume.
    const args: string[] = [
      '--print', '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
      '--disable-slash-commands',
    ];

    if (opts.sessionContinue) {
      args.push('--continue');
    } else {
      args.push('--no-session-persistence');
    }

    args.push('--plugin-dir', '/dev/null');
    if (opts.model !== undefined) {
      args.push('--model', opts.model);
    }
    if (opts.maxTurns !== undefined) {
      args.push('--max-turns', String(opts.maxTurns));
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    const cleaned = stripHookJson(raw);
    const lines = cleaned.split('\n');

    // Prefer the "result" event — it contains the complete final text and
    // avoids duplication from intermediate "assistant" content_block events.
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        if (obj['type'] === 'result' && typeof obj['result'] === 'string') {
          const text = (obj['result'] as string).trim();
          if (text.length > 0) return collapseWhitespace(text);
        }
      } catch { /* not JSON, skip */ }
    }

    // Fallback: extract text from all events (for non-standard output)
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
          // Preserve valid JSON that isn't a structural frame (no 'type' field)
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
      if (key.startsWith('CLAUDE')) {
        delete filtered[key];
      }
    }
    // Signal to plugins (martin-loop, etc.) that this is a spawned child process.
    // Plugins should check this and skip activation to avoid poisoning the session.
    filtered['FRANKENBEAST_SPAWNED'] = '1';
    return filtered;
  }

  supportsStreamJson(): boolean {
    return true;
  }

  supportsNativeSessionResume(): boolean {
    return true;
  }

  defaultContextWindowTokens(): number {
    return 200_000;
  }
}
