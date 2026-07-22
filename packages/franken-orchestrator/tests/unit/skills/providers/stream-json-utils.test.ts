import { describe, it, expect } from 'vitest';
import { tryExtractTextFromNode, stripHookJson, cleanLlmJson, BASE_RATE_LIMIT_PATTERNS, extractNdjsonTokenUsage, extractNdjsonModel } from '../../../../src/skills/providers/stream-json-utils.js';

describe('tryExtractTextFromNode', () => {
  it('extracts direct string values', () => {
    const out: string[] = [];
    tryExtractTextFromNode('hello', out);
    expect(out).toEqual(['hello']);
  });

  it('skips whitespace-only strings', () => {
    const out: string[] = [];
    tryExtractTextFromNode('   ', out);
    expect(out).toEqual([]);
  });

  it('extracts text from direct keys (text, output_text, output)', () => {
    const out: string[] = [];
    tryExtractTextFromNode({ text: 'a', output_text: 'b', output: 'c' }, out);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('recurses into nested keys (delta, content, message, content_block)', () => {
    const out: string[] = [];
    tryExtractTextFromNode({ delta: { text: 'from delta' } }, out);
    expect(out).toEqual(['from delta']);
  });

  it('handles arrays', () => {
    const out: string[] = [];
    tryExtractTextFromNode([{ text: 'one' }, { text: 'two' }], out);
    expect(out).toEqual(['one', 'two']);
  });

  it('returns nothing for structural-only JSON (no text fields)', () => {
    const out: string[] = [];
    tryExtractTextFromNode({ type: 'thread.started', thread_id: '019ccc41' }, out);
    expect(out).toEqual([]);
  });

  it('handles null and undefined', () => {
    const out: string[] = [];
    tryExtractTextFromNode(null, out);
    tryExtractTextFromNode(undefined, out);
    expect(out).toEqual([]);
  });

  it('recurses into content_block nested key', () => {
    const out: string[] = [];
    tryExtractTextFromNode({ content_block: { text: 'from block' } }, out);
    expect(out).toEqual(['from block']);
  });

  it('recurses into codex-style item payloads', () => {
    const out: string[] = [];
    tryExtractTextFromNode({
      item: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'from item' }],
      },
    }, out);
    expect(out).toEqual(['from item']);
  });

  it('recurses into codex-style part payloads', () => {
    const out: string[] = [];
    tryExtractTextFromNode({ part: { type: 'output_text', text: 'from part' } }, out);
    expect(out).toEqual(['from part']);
  });

  it('recurses into structured output containers without duplicating string output', () => {
    const out: string[] = [];
    tryExtractTextFromNode({ output: [{ type: 'output_text', text: 'from output array' }] }, out);
    expect(out).toEqual(['from output array']);
  });
});

describe('stripHookJson', () => {
  it('strips a single hookSpecificOutput object', () => {
    const input = '{ "hookSpecificOutput": { "hookEventName": "SessionStart" } }[{"id":"chunk1"}]';
    expect(stripHookJson(input)).toBe('[{"id":"chunk1"}]');
  });

  it('strips hook output when an earlier property contains braces in a string', () => {
    const input = '{ "message": "value with { braces }", "hookSpecificOutput": {} }[{"id":"a"}]';
    expect(stripHookJson(input)).toBe('[{"id":"a"}]');
  });

  it('ignores unmatched quotes in raw text before hook output', () => {
    const input = 'warning: "foo\n{ "hookSpecificOutput": {} }[{"id":"a"}]';
    expect(stripHookJson(input)).toBe('warning: "foo\n[{"id":"a"}]');
  });

  it('recovers from unmatched diagnostic braces and quotes before hook output', () => {
    const input = 'warning: { "foo\n{ "hookSpecificOutput": {} }[{"id":"a"}]';
    expect(stripHookJson(input)).toBe('warning: { "foo\n[{"id":"a"}]');
  });

  it('strips hook output with nested braces in string values', () => {
    const input = '{ "hookSpecificOutput": { "data": "value with { braces }" } }[{"id":"a"}]';
    expect(stripHookJson(input)).toBe('[{"id":"a"}]');
  });

  it('strips multiple hook objects', () => {
    const input = '{ "hookSpecificOutput": {} }{ "hookSpecificOutput": {} }[1,2,3]';
    expect(stripHookJson(input)).toBe('[1,2,3]');
  });

  it('strips many hook blocks from large provider output', () => {
    const hook = '{ "hookSpecificOutput": { "hookEventName": "SessionStart" } }';
    const retained = 'x'.repeat(1_000_000) + '[{"id":"chunk1"}]';
    const input = retained.slice(0, 1_000_000) + hook.repeat(2_000) + retained.slice(1_000_000);

    const result = stripHookJson(input);

    expect(result).toBe(retained);
  });

  it('returns text unchanged when no hook output present', () => {
    const input = '[{"id":"chunk1","objective":"do stuff"}]';
    expect(stripHookJson(input)).toBe(input);
  });

  it('handles empty input', () => {
    expect(stripHookJson('')).toBe('');
  });

  it('strips pretty-printed multi-line hook JSON', () => {
    const input = `{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\\nYou have superpowers.\\n</EXTREMELY_IMPORTANT>"
  }
}
[{"id":"chunk1"}]`;
    expect(stripHookJson(input)).toBe('[{"id":"chunk1"}]');
  });
});

describe('cleanLlmJson', () => {
  it('returns clean JSON unchanged', () => {
    const input = '[{"id":"chunk1"}]';
    expect(cleanLlmJson(input)).toBe(input);
  });

  it('strips opening code fence with json tag', () => {
    const input = '```json\n[{"id":"chunk1"}]';
    expect(JSON.parse(cleanLlmJson(input))).toEqual([{ id: 'chunk1' }]);
  });

  it('strips both opening and closing code fences', () => {
    const input = '```json\n[{"id":"chunk1"}]\n```';
    expect(JSON.parse(cleanLlmJson(input))).toEqual([{ id: 'chunk1' }]);
  });

  it('strips code fences without language tag', () => {
    const input = '```\n{"key":"value"}\n```';
    expect(JSON.parse(cleanLlmJson(input))).toEqual({ key: 'value' });
  });

  it('strips trailing commas', () => {
    const input = '[{"id":"a",},{"id":"b",},]';
    expect(JSON.parse(cleanLlmJson(input))).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('handles code fences + hook output + trailing commas together', () => {
    const input = '{ "hookSpecificOutput": {} }```json\n[{"id":"a",}]\n```';
    expect(JSON.parse(cleanLlmJson(input))).toEqual([{ id: 'a' }]);
  });

  it('handles opening fence only (no closing fence)', () => {
    const input = '```json\n[{"id":"chunk1"},{"id":"chunk2"}]';
    expect(JSON.parse(cleanLlmJson(input))).toEqual([{ id: 'chunk1' }, { id: 'chunk2' }]);
  });

  it('handles multi-line fenced JSON', () => {
    const input = `\`\`\`json
[
  {
    "id": "setup",
    "objective": "Set up project"
  }
]
\`\`\``;
    const result = JSON.parse(cleanLlmJson(input));
    expect(result).toEqual([{ id: 'setup', objective: 'Set up project' }]);
  });

  it('preserves comma-bracket text inside valid JSON strings when fast path is skipped', () => {
    const input = '[{"id":"chunk1","objective":"Keep literal ,] and ,} text"}]';
    const cleaned = cleanLlmJson(input, { parseFastPath: false });
    expect(JSON.parse(cleaned)).toEqual([{ id: 'chunk1', objective: 'Keep literal ,] and ,} text' }]);
  });

  it('can skip the JSON.parse fast path for callers that must enforce limits first', () => {
    const input = '[{"id":"chunk1"}]';
    const originalParse = JSON.parse;
    JSON.parse = (() => { throw new Error('fast path used'); }) as typeof JSON.parse;
    try {
      expect(cleanLlmJson(input, { parseFastPath: false })).toBe(input);
    } finally {
      JSON.parse = originalParse;
    }
  });

  it('strips whitespace around fences', () => {
    const input = '  \n```json\n[1,2,3]\n```\n  ';
    expect(JSON.parse(cleanLlmJson(input))).toEqual([1, 2, 3]);
  });
});

describe('BASE_RATE_LIMIT_PATTERNS', () => {
  it('matches common rate limit indicators', () => {
    expect(BASE_RATE_LIMIT_PATTERNS.test('rate limit exceeded')).toBe(true);
    expect(BASE_RATE_LIMIT_PATTERNS.test('HTTP 429')).toBe(true);
    expect(BASE_RATE_LIMIT_PATTERNS.test('too many requests')).toBe(true);
    expect(BASE_RATE_LIMIT_PATTERNS.test('server overloaded')).toBe(true);
  });

  it('does not match normal errors', () => {
    expect(BASE_RATE_LIMIT_PATTERNS.test('file not found')).toBe(false);
    expect(BASE_RATE_LIMIT_PATTERNS.test('syntax error')).toBe(false);
  });
});

describe('extractNdjsonTokenUsage', () => {
  it('returns undefined when no line carries usage', () => {
    const raw = [
      '{"type":"message_start"}',
      '{"type":"content_block_delta","delta":{"text":"hi"}}',
    ].join('\n');
    expect(extractNdjsonTokenUsage(raw)).toBeUndefined();
  });

  it('extracts input/output tokens from a top-level usage object', () => {
    const raw = '{"type":"result","result":"done","usage":{"input_tokens":100,"output_tokens":25}}';
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 100, outputTokens: 25, totalTokens: 125 });
  });

  it('extracts Claude result totals reported directly on the top-level frame', () => {
    const raw = '{"type":"result","result":"done","total_input_tokens":100,"total_output_tokens":25}';
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 100, outputTokens: 25, totalTokens: 125 });
  });

  it('extracts usage nested under a message field (Claude message_delta shape)', () => {
    const raw = '{"type":"message_delta","message":{"usage":{"input_tokens":40,"output_tokens":10}}}';
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 40, outputTokens: 10, totalTokens: 50 });
  });

  it('accepts camelCase and provider-specific field aliases', () => {
    const raw = '{"type":"usage","usage":{"promptTokenCount":7,"candidatesTokenCount":3}}';
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
  });

  it('keeps the last reported reading across multiple usage-bearing lines', () => {
    const raw = [
      '{"type":"usage","usage":{"input_tokens":10,"output_tokens":2}}',
      '{"type":"usage","usage":{"input_tokens":10,"output_tokens":5}}',
    ].join('\n');
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('ignores non-JSON and malformed lines without throwing', () => {
    const raw = [
      'plain text line',
      '{not valid json',
      '{"type":"result","usage":{"input_tokens":5,"output_tokens":1}}',
    ].join('\n');
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 5, outputTokens: 1, totalTokens: 6 });
  });

  it('treats a partial reading (only one of input/output) as zero for the missing side', () => {
    const raw = '{"type":"usage","usage":{"output_tokens":9}}';
    expect(extractNdjsonTokenUsage(raw)).toEqual({ inputTokens: 0, outputTokens: 9, totalTokens: 9 });
  });
});

describe('extractNdjsonModel', () => {
  it('returns undefined when no line reports a model', () => {
    const raw = [
      '{"type":"turn.started"}',
      '{"type":"turn.completed","usage":{"input_tokens":5,"output_tokens":1}}',
    ].join('\n');
    expect(extractNdjsonModel(raw)).toBeUndefined();
  });

  it('extracts the model from an assistant message event', () => {
    const raw = '{"type":"assistant","message":{"model":"claude-sonnet-5","content":[]}}';
    expect(extractNdjsonModel(raw)).toBe('claude-sonnet-5');
  });

  it('falls back to the modelUsage key on the terminal result event', () => {
    const raw = '{"type":"result","subtype":"success","modelUsage":{"claude-opus-4-8":{"inputTokens":1,"outputTokens":1}}}';
    expect(extractNdjsonModel(raw)).toBe('claude-opus-4-8');
  });

  it('prefers the assistant message model over a later modelUsage key mismatch', () => {
    const raw = [
      '{"type":"assistant","message":{"model":"claude-sonnet-5","content":[]}}',
      '{"type":"result","modelUsage":{"claude-opus-4-8":{}}}',
    ].join('\n');
    // Last-seen-wins, matching extractNdjsonTokenUsage's semantics — the
    // terminal result event is genuinely the most recent line.
    expect(extractNdjsonModel(raw)).toBe('claude-opus-4-8');
  });

  it('ignores non-JSON and malformed lines without throwing', () => {
    const raw = [
      'plain text line',
      '{not valid json',
      '{"type":"assistant","message":{"model":"claude-sonnet-5"}}',
    ].join('\n');
    expect(extractNdjsonModel(raw)).toBe('claude-sonnet-5');
  });

  it('ignores a non-string model field', () => {
    const raw = '{"type":"assistant","message":{"model":123}}';
    expect(extractNdjsonModel(raw)).toBeUndefined();
  });
});
