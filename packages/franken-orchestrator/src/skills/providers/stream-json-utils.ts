/**
 * Shared stream-json utilities used by multiple CLI providers.
 *
 * Extracted to eliminate duplication across claude-provider, codex-provider,
 * and gemini-provider.
 */

import type { TokenUsage } from '@franken/types';

/** Common rate-limit detection patterns shared across providers. */
export const BASE_RATE_LIMIT_PATTERNS =
  /rate.?limit|429|too many requests|retry.?after|overloaded|capacity|temporarily unavailable|out of extra usage|usage limit|resets?\s+\d|resets?\s+in\s+\d+\s*s/i;

// Alias lists mirror what the streaming provider adapters (providers/*.ts)
// already accept from Claude Code CLI / Codex CLI / Gemini CLI stream-json
// output, so a single parser covers all three without per-provider drift.
const INPUT_TOKEN_KEYS = ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokenCount', 'totalInputTokens'];
const OUTPUT_TOKEN_KEYS = ['output_tokens', 'outputTokens', 'completion_tokens', 'candidatesTokenCount', 'totalOutputTokens'];

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extracts real token usage from a CLI provider's NDJSON stdout (Claude Code
 * CLI / Codex CLI / Gemini CLI `stream-json`/`--json` output). Each line is
 * parsed independently; a `usage` object may sit at the top level or nested
 * under `message` (Claude's `message_delta`/`result` events). The CLIs report
 * running totals as the turn progresses, so the last non-undefined reading
 * for each field wins. Returns `undefined` (never a zeroed object) when no
 * line carries usage — "unknown", not "zero".
 */
export function extractNdjsonTokenUsage(raw: string): TokenUsage | undefined {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;

    const candidates: unknown[] = [obj['usage'], (obj['message'] as Record<string, unknown> | undefined)?.['usage']];
    for (const candidate of candidates) {
      if (typeof candidate !== 'object' || candidate === null) continue;
      const usage = candidate as Record<string, unknown>;
      inputTokens = firstNumber(usage, INPUT_TOKEN_KEYS) ?? inputTokens;
      outputTokens = firstNumber(usage, OUTPUT_TOKEN_KEYS) ?? outputTokens;
    }
  }

  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  const finalInput = inputTokens ?? 0;
  const finalOutput = outputTokens ?? 0;
  return { inputTokens: finalInput, outputTokens: finalOutput, totalTokens: finalInput + finalOutput };
}

/**
 * Extracts the real resolved model name from a CLI provider's NDJSON stdout,
 * when the CLI reports one. Claude Code CLI echoes `message.model` on every
 * `assistant` event and keys its terminal `result` event's `modelUsage` by
 * model name — either is authoritative, since it reflects what actually
 * executed (which can differ from what was requested, e.g. account-level
 * routing this codebase has no other visibility into). Not every CLI
 * reports this at all (Codex's `--json` output never includes a model
 * field); returns `undefined` rather than guessing.
 */
export function extractNdjsonModel(raw: string): string | undefined {
  let model: string | undefined;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;

    const message = obj['message'] as Record<string, unknown> | undefined;
    if (typeof message?.['model'] === 'string' && message['model'].length > 0) {
      model = message['model'];
      continue;
    }

    const modelUsage = obj['modelUsage'];
    if (typeof modelUsage === 'object' && modelUsage !== null) {
      const [firstKey] = Object.keys(modelUsage);
      if (firstKey) {
        model = firstKey;
      }
    }
  }

  return model;
}

/**
 * Return whether the quote at `index` is escaped by an odd backslash run.
 */
function isEscapedQuote(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

/** Find the JSON object containing a marker whose opening quote is at `index`. */
function findContainingObjectStart(text: string, index: number): number {
  let depth = 0;
  let inStr = false;

  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i]!;
    if (ch === '"' && !isEscapedQuote(text, i)) {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '}') {
      depth++;
    } else if (ch === '{') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** Find the exclusive end of a JSON object, respecting quoted braces. */
function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') {
      depth++;
    } else if (ch === '}' && --depth === 0) {
      return i + 1;
    }
  }
  return -1;
}

/**
 * Strip JSON objects containing "hookSpecificOutput" from text.
 * Hook output leaks from spawned CLI processes when project-scoped hooks fire
 * despite FRANKENBEAST_SPAWNED=1. Marker searches advance monotonically and
 * only scan the matching object boundaries; retained output is rebuilt once.
 */
export function stripHookJson(text: string): string {
  const MARKER = '"hookSpecificOutput"';
  const removalRanges: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const markerIndex = text.indexOf(MARKER, searchFrom);
    if (markerIndex === -1) break;
    searchFrom = markerIndex + MARKER.length;

    // Only treat an unescaped marker followed by a colon as a property key.
    if (isEscapedQuote(text, markerIndex)) continue;
    let colonIndex = searchFrom;
    while (/\s/.test(text[colonIndex] ?? '')) colonIndex++;
    if (text[colonIndex] !== ':') continue;

    const start = findContainingObjectStart(text, markerIndex);
    if (start === -1) continue;
    const end = findObjectEnd(text, start);
    if (end === -1) continue;

    removalRanges.push({ start, end });
    searchFrom = end;
  }

  if (removalRanges.length === 0) return text.trim();

  removalRanges.sort((a, b) => a.start - b.start || b.end - a.end);
  const mergedRanges: Array<{ start: number; end: number }> = [];
  for (const range of removalRanges) {
    const previous = mergedRanges.at(-1);
    if (previous !== undefined && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      mergedRanges.push({ ...range });
    }
  }

  const retained: string[] = [];
  let cursor = 0;
  for (const range of mergedRanges) {
    retained.push(text.slice(cursor, range.start));
    cursor = range.end;
  }
  retained.push(text.slice(cursor));
  return retained.join('').trim();
}

export interface CleanLlmJsonOptions {
  readonly parseFastPath?: boolean;
}

/**
 * Clean raw LLM output so it can be JSON.parse()'d.
 * Uses bracket-depth matching to extract the JSON structure,
 * so it works regardless of markdown wrapping, code fences,
 * leading/trailing prose, or other LLM formatting quirks.
 */
export function cleanLlmJson(raw: string, options: CleanLlmJsonOptions = {}): string {
  let text = stripHookJson(raw.trim());

  // Try parsing as-is first (fast path)
  if (options.parseFastPath !== false) {
    try { JSON.parse(text); return text; } catch { /* fall through */ }
  }

  // Find the first [ or { and extract the matching structure
  // using bracket-depth counting that respects quoted strings.
  const extracted = extractJsonStructure(text);
  if (extracted !== null) {
    // Strip trailing commas before } or ] (common LLM artifact)
    return stripTrailingJsonCommas(extracted);
  }

  // Last resort: strip fences and trailing commas, hope for the best
  text = text.replace(/^`{3,}\w*\s*\n?/, '');
  text = text.replace(/\n?\s*`{3,}\s*$/, '');
  text = text.trim();
  text = stripTrailingJsonCommas(text);
  return text;
}

function stripTrailingJsonCommas(text: string): string {
  let result = '';
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (esc) {
      esc = false;
      result += ch;
      continue;
    }
    if (ch === '\\' && inStr) {
      esc = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      result += ch;
      continue;
    }
    if (!inStr && ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/u.test(text[j]!)) j++;
      if (text[j] === '}' || text[j] === ']') {
        continue;
      }
    }
    result += ch;
  }

  return result;
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
