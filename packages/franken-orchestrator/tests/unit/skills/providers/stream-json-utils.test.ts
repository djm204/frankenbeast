import { describe, it, expect } from 'vitest';
import { tryExtractTextFromNode, stripHookJson, cleanLlmJson, BASE_RATE_LIMIT_PATTERNS, parseCommonRetryAfterMs, collapseWhitespace } from '../../../../src/skills/providers/stream-json-utils.js';

describe('parseCommonRetryAfterMs', () => {
  it('parses retry-after header with seconds', () => {
    expect(parseCommonRetryAfterMs('retry-after: 60')).toBe(60000);
    expect(parseCommonRetryAfterMs('retry-after: 30s')).toBe(30000);
  });

  it('parses "retry after Xs" pattern', () => {
    expect(parseCommonRetryAfterMs('Please retry after 25s')).toBe(25000);
  });

  it('parses "try again in N minute(s)"', () => {
    expect(parseCommonRetryAfterMs('try again in 5 minutes')).toBe(300000);
    expect(parseCommonRetryAfterMs('try again in 1 minute')).toBe(60000);
  });

  it('parses "try again in N second(s)"', () => {
    expect(parseCommonRetryAfterMs('try again in 30 seconds')).toBe(30000);
  });

  it('parses "resets in Ns"', () => {
    expect(parseCommonRetryAfterMs('Rate limit resets in 10s')).toBe(10000);
  });

  it('returns undefined for unknown patterns', () => {
    expect(parseCommonRetryAfterMs('some other error')).toBeUndefined();
  });
});

describe('collapseWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(collapseWhitespace('hello   world')).toBe('hello world');
  });

  it('preserves single spaces', () => {
    expect(collapseWhitespace('hello world')).toBe('hello world');
  });

  it('preserves newlines', () => {
    expect(collapseWhitespace('hello\n\nworld')).toBe('hello\n\nworld');
  });

  it('collapses tabs into single spaces', () => {
    expect(collapseWhitespace('hello\t\tworld')).toBe('hello world');
  });
});

describe('tryExtractTextFromNode', () => {
  it('extracts direct string values', () => {
    const out: string[] = [];
    tryExtractTextFromNode('hello', out);
    expect(out).toEqual(['hello']);
  });

  it('preserves whitespace-only strings', () => {
    const out: string[] = [];
    tryExtractTextFromNode('   ', out);
    expect(out).toEqual(['   ']);
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

  it('strips hook output with nested braces in string values', () => {
    const input = '{ "hookSpecificOutput": { "data": "value with { braces }" } }[{"id":"a"}]';
    expect(stripHookJson(input)).toBe('[{"id":"a"}]');
  });

  it('strips multiple hook objects', () => {
    const input = '{ "hookSpecificOutput": {} }{ "hookSpecificOutput": {} }[1,2,3]';
    expect(stripHookJson(input)).toBe('[1,2,3]');
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
