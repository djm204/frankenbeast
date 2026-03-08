import { describe, it, expect } from 'vitest';
import { version } from '../../src/index';

describe('index', () => {
  it('exports a non-empty version string', () => {
    expect(version).toBeTypeOf('string');
    expect(version.length).toBeGreaterThan(0);
  });
});
