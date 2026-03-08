import { describe, it, expect } from 'vitest';
import { VERSION } from '../../src/index.js';

describe('smoke', () => {
  it('test harness runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('exports a non-empty version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});
