import { describe, it, expect } from 'vitest';
import { generateId } from '../../../src/types/ids.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });

  it('generates unique ids', () => {
    const ids = Array.from({ length: 100 }, () => generateId());
    const unique = new Set(ids);
    expect(unique.size).toBe(100);
  });

  it('ids generated later are lexicographically greater (sortable)', async () => {
    const first = generateId();
    await new Promise((r) => setTimeout(r, 2));
    const second = generateId();
    expect(second > first).toBe(true);
  });
});
