/**
 * Claude CLI provider implementation.
 *
 * Extracted from martin-loop.ts: buildClaudeArgs, RATE_LIMIT_PATTERNS,
 * parseResetTime, and env filtering logic.
 */

import type { ICliProvider, ProviderOpts } from './cli-provider.js';
import { tryExtractTextFromNode, BASE_RATE_LIMIT_PATTERNS } from './stream-json-utils.js';

// Re-export for backward compatibility (used by providers/index.ts)
export { tryExtractTextFromNode } from './stream-json-utils.js';

const RATE_LIMIT_PATTERNS = BASE_RATE_LIMIT_PATTERNS;

export class ClaudeProvider implements ICliProvider {
  readonly name = 'claude';
  readonly command = 'claude';

  buildArgs(opts: ProviderOpts): string[] {
    const args: string[] = [
      '--print', '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--plugin-dir', '/dev/null',
    ];
    if (opts.maxTurns !== undefined) {
      args.push('--max-turns', String(opts.maxTurns));
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs);
    }
    return args;
  }

  normalizeOutput(raw: string): string {
    const cleaned = stripHookBlocks(raw);
    const lines = cleaned.split('\n');
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
        // Not JSON — pass through as plain text
        extracted.push(trimmed);
      }
    }

    return extracted.join('\n').trim();
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  isRateLimited(stderr: string): boolean {
    return RATE_LIMIT_PATTERNS.test(stderr);
  }

  parseRetryAfter(stderr: string): number | undefined {
    // "retry-after: 30" or "retry-after: 30s"
    const retryAfterHeaderMatch = stderr.match(/retry.?after:?\s*(\d+)\s*s?/i);
    if (retryAfterHeaderMatch?.[1]) {
      return parseInt(retryAfterHeaderMatch[1], 10) * 1000;
    }

    // "retry after 25s"
    const retryAfterPatternMatch = stderr.match(/retry.?after\s+(\d+)\s*s?/i);
    if (retryAfterPatternMatch?.[1]) {
      return parseInt(retryAfterPatternMatch[1], 10) * 1000;
    }

    // "try again in 5 minutes"
    const minutesMatch = stderr.match(/try again in (\d+) minute/i);
    if (minutesMatch?.[1]) {
      return parseInt(minutesMatch[1], 10) * 60 * 1000;
    }

    // "try again in 30 seconds"
    const secondsMatch = stderr.match(/try again in (\d+) second/i);
    if (secondsMatch?.[1]) {
      return parseInt(secondsMatch[1], 10) * 1000;
    }

    // "resets in 30s"
    const resetsInMatch = stderr.match(/resets?\s+in\s+(\d+)\s*s/i);
    if (resetsInMatch?.[1]) {
      return parseInt(resetsInMatch[1], 10) * 1000;
    }

    return undefined;
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
}

/**
 * Strip JSON blocks containing "hookSpecificOutput" from raw CLI output.
 * Uses brace-depth matching to correctly handle multi-line pretty-printed
 * hook JSON with nested braces in string values.
 */
function stripHookBlocks(raw: string): string {
  const MARKER = '"hookSpecificOutput"';
  let result = raw;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const markerIdx = result.indexOf(MARKER);
    if (markerIdx === -1) break;

    // Walk backward from marker to find the opening '{' of the enclosing object
    let start = -1;
    for (let i = markerIdx - 1; i >= 0; i--) {
      if (result[i] === '{') {
        start = i;
        break;
      }
    }
    if (start === -1) break;

    // Walk forward from start using brace-depth matching to find the closing '}'
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = start; i < result.length; i++) {
      const ch = result[i]!;

      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }

    if (end === -1) break;

    result = result.slice(0, start) + result.slice(end + 1);
  }

  return result;
}
