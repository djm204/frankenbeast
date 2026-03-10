import { describe, it, expect } from 'vitest';
import { VERSION } from '../../../src/governor/index.js';

describe('@franken/safety/governor', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toBe('0.1.0');
  });
});
