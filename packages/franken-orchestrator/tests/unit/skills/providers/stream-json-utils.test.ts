import { describe, it, expect } from 'vitest';
import { tryExtractTextFromNode, BASE_RATE_LIMIT_PATTERNS } from '../../../../src/skills/providers/stream-json-utils.js';

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
