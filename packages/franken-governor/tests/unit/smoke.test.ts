import { describe, it, expect } from 'vitest';
import { VERSION } from '../../src/index.js';

describe('@franken/governor', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toBe('0.1.0');
  });
});
