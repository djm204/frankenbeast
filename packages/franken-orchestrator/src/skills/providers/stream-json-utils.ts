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

/**
 * Clean raw LLM output so it can be JSON.parse()'d.
 * Uses bracket-depth matching to extract the JSON structure,
 * so it works regardless of markdown wrapping, code fences,
 * leading/trailing prose, or other LLM formatting quirks.
 */
export function cleanLlmJson(raw: string): string {
  let text = stripHookJson(raw.trim());

  // Try parsing as-is first (fast path)
  try { JSON.parse(text); return text; } catch { /* fall through */ }

  // Find the first [ or { and extract the matching structure
  // using bracket-depth counting that respects quoted strings.
  const extracted = extractJsonStructure(text);
  if (extracted !== null) {
    // Strip trailing commas before } or ] (common LLM artifact)
    return extracted.replace(/,\s*([}\]])/g, '$1');
  }

  // Last resort: strip fences and trailing commas, hope for the best
  text = text.replace(/^`{3,}\w*\s*\n?/, '');
  text = text.replace(/\n?\s*`{3,}\s*$/, '');
  text = text.trim();
  text = text.replace(/,\s*([}\]])/g, '$1');
  return text;
}

/**
 * Find the first `[` or `{` in the text and extract the complete
 * JSON structure by bracket-depth counting, respecting quoted strings.
 * Returns null if no valid structure is found.
 */
function extractJsonStructure(text: string): string | null {
  // Find first [ or {
  let start = -1;
  let openChar = '';
  let closeChar = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[' || text[i] === '{') {
      start = i;
      openChar = text[i]!;
      closeChar = openChar === '[' ? ']' : '}';
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Recursively extract text from a stream-json node. */
export function tryExtractTextFromNode(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    // Preserve whitespace tokens if they are non-empty
    if (node.length > 0) out.push(node);
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
    if (typeof value === 'string' && value.length > 0) {
      out.push(value);
    }
  }

  // Codex JSON events often wrap assistant text inside item/part payloads.
  // Claude/Gemini stream-json frames use content/message/content_block shapes.
  const nestedKeys = [
    'delta',
    'content',
    'parts',
    'part',
    'data',
    'result',
    'response',
    'message',
    'content_block',
    'item',
    'items',
  ];
  for (const key of nestedKeys) {
    if (obj[key] !== undefined) {
      tryExtractTextFromNode(obj[key], out);
    }
  }

  // Some providers place structured content under `output` as an array/object
  // instead of a direct string. Recurse only for non-strings to avoid duplicates.
  const output = obj['output'];
  if (output !== undefined && typeof output !== 'string') {
    tryExtractTextFromNode(output, out);
  }
}
