import { describe, expect, it } from 'vitest';
import { parseSafeJson, SafeJsonParseError } from '../../../src/utils/safe-json.js';

describe('parseSafeJson', () => {
  it('parses safe JSON documents', () => {
    expect(parseSafeJson('{"ok":[1,2,3]}')).toEqual({ ok: [1, 2, 3] });
  });

  it('rejects huge JSON before parsing and identifies the byte limit', () => {
    expect(() => parseSafeJson(JSON.stringify({ data: 'x'.repeat(32) }), {
      context: 'test payload',
      maxBytes: 16,
    })).toThrow(SafeJsonParseError);

    expect(() => parseSafeJson(JSON.stringify({ data: 'x'.repeat(32) }), {
      context: 'test payload',
      maxBytes: 16,
    })).toThrow(/test payload exceeds maxBytes/u);
  });

  it('rejects deeply nested JSON and identifies the depth limit', () => {
    const deep = '{"a":{"b":{"c":{"d":1}}}}';

    expect(() => parseSafeJson(deep, {
      context: 'nested config',
      maxDepth: 3,
    })).toThrow(/nested config exceeds maxDepth/u);
  });

  it('rejects objects with too many keys and identifies the key limit', () => {
    const manyKeys = JSON.stringify({ a: 1, b: 2, c: 3 });

    expect(() => parseSafeJson(manyKeys, {
      context: 'object config',
      maxObjectKeys: 2,
    })).toThrow(/object config exceeds maxObjectKeys/u);
  });

  it('rejects arrays with too many items and identifies the array-item limit', () => {
    expect(() => parseSafeJson('[1,2,3,4]', {
      context: 'issue payload',
      maxArrayItems: 3,
    })).toThrow(/issue payload exceeds maxArrayItems/u);
  });

  it('rejects alias-like JSON fanout through the same container count checks used after parsing', () => {
    const fanout = JSON.stringify({
      items: Array.from({ length: 4 }, (_, index) => ({ index })),
    });

    expect(() => parseSafeJson(fanout, {
      context: 'fanout payload',
      maxContainers: 4,
    })).toThrow(/fanout payload exceeds maxContainers/u);
  });
});
