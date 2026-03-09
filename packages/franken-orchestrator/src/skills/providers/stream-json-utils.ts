/**
 * Shared stream-json utilities used by multiple CLI providers.
 *
 * Extracted to eliminate duplication across claude-provider, codex-provider,
 * and gemini-provider.
 */

/** Common rate-limit detection patterns shared across providers. */
export const BASE_RATE_LIMIT_PATTERNS =
  /rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;

/** Recursively extract text from a stream-json node. */
/**
 * Strip JSON objects containing "hookSpecificOutput" from text.
 * Hook output leaks from spawned CLI processes when project-scoped hooks fire
 * despite FRANKENBEAST_SPAWNED=1. Uses brace-depth matching to handle
 * multi-line pretty-printed JSON with nested braces in string values.
 */
export function stripHookJson(text: string): string {
  const MARKER = '"hookSpecificOutput"';
  let result = text;

  while (true) {
    const idx = result.indexOf(MARKER);
    if (idx === -1) break;

    // Walk backward to find opening '{'
    let start = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (result[i] === '{') { start = i; break; }
    }
    if (start === -1) break;

    // Walk forward with brace-depth to find closing '}'
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < result.length; i++) {
      const ch = result[i]!;
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) break;

    result = result.slice(0, start) + result.slice(end + 1);
  }

  return result.trim();
}

/** Recursively extract text from a stream-json node. */
export function tryExtractTextFromNode(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    if (node.trim().length > 0) out.push(node);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) tryExtractTextFromNode(item, out);
    return;
  }

  const obj = node as Record<string, unknown>;
  const directKeys = ['text', 'output_text', 'output'];
  for (const key of directKeys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      out.push(value);
    }
  }

  const nestedKeys = ['delta', 'content', 'parts', 'data', 'result', 'response', 'message', 'content_block'];
  for (const key of nestedKeys) {
    if (obj[key] !== undefined) {
      tryExtractTextFromNode(obj[key], out);
    }
  }
}
