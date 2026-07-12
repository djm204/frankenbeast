import { describe, expect, it } from 'vitest';
import {
  assertSafeJsonPointer,
  getJsonPointerValue,
  parseJsonPointer,
  setJsonPointerValue,
  UnsafeJsonPointerError,
} from '../src/json-pointer.js';

describe('safe JSON Pointer helpers', () => {
  it('parses and resolves RFC 6901 escaped path segments', () => {
    const document = {
      agents: [
        {
          config: {
            'a/b': { '~enabled': true },
          },
        },
      ],
    };

    expect(parseJsonPointer('/agents/0/config/a~1b/~0enabled')).toEqual(['agents', '0', 'config', 'a/b', '~enabled']);
    expect(getJsonPointerValue(document, '/agents/0/config/a~1b/~0enabled')).toBe(true);
  });

  it('rejects prototype-polluting segments by default', () => {
    const pollutedBefore = ({} as Record<string, unknown>).polluted;
    const target: Record<string, unknown> = {};

    for (const pointer of ['/__proto__/polluted', '/constructor/prototype/polluted', '/safe/prototype/polluted']) {
      expect(() => setJsonPointerValue(target, pointer, true)).toThrow(UnsafeJsonPointerError);
    }

    expect(({} as Record<string, unknown>).polluted).toBe(pollutedBefore);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('writes missing branches as own data properties without inherited traversal', () => {
    const target: Record<string, unknown> = {};

    setJsonPointerValue(target, '/agents/0/moduleConfig/firewall', false);

    expect(target).toEqual({ agents: [{ moduleConfig: { firewall: false } }] });
    expect(getJsonPointerValue(target, '/agents/0/moduleConfig/firewall')).toBe(false);
  });

  it('does not traverse inherited array indexes when writing nested paths', () => {
    const inherited = { polluted: false };
    Object.defineProperty(Array.prototype, '0', {
      configurable: true,
      writable: true,
      value: inherited,
    });

    try {
      const target = new Array(1) as unknown[];

      setJsonPointerValue(target, '/0/enabled', true);

      expect(inherited).toEqual({ polluted: false });
      expect(Object.prototype.hasOwnProperty.call(target, 0)).toBe(true);
      expect(target[0]).toEqual({ enabled: true });
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)['0'];
    }
  });

  it('bounds array indexes before creating sparse arrays', () => {
    const target: Record<string, unknown> = {};

    expect(() => setJsonPointerValue(target, '/agents/4294967294/name', 'agent')).toThrow(/maximum allowed array index/i);
    expect(target).toEqual({});
  });

  it('checks segment count before materializing oversized pointer arrays', () => {
    const oversized = `/${'x/'.repeat(129)}`;

    expect(() => parseJsonPointer(oversized)).toThrow(/too many path segments/i);
  });

  it('requires an explicit override for unsafe compatibility keys and still avoids prototype mutation', () => {
    const target: Record<string, unknown> = {};

    setJsonPointerValue(target, '/__proto__/polluted', 'data-only', { allowUnsafePrototypeSegments: true });

    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.prototype.hasOwnProperty.call(target, '__proto__')).toBe(true);
    expect(getJsonPointerValue(target, '/__proto__/polluted', { allowUnsafePrototypeSegments: true })).toBe('data-only');
    expect(() => assertSafeJsonPointer('/__proto__/polluted')).toThrow(/blocked/i);
  });

  it('fails closed on invalid pointer syntax and unsafe oversized paths', () => {
    expect(() => parseJsonPointer('agents/0')).toThrow(/start with/i);
    expect(() => parseJsonPointer('/agents/~2bad')).toThrow(/invalid escape/i);
    expect(() => parseJsonPointer('/a/b', { maxSegments: 1 })).toThrow(/too many/i);
    expect(() => parseJsonPointer('/long', { maxSegmentLength: 2 })).toThrow(/exceeds/i);
  });
});
