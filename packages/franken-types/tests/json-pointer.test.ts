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
