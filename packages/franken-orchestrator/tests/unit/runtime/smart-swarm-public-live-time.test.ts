import { describe, expect, it } from 'vitest';
import { hermesTimestamp } from '../../e2e/smart-swarm-public-live-time.js';

describe('public Smart Swarm acceptance timestamp normalization', () => {
  it('normalizes Hermes Unix seconds and milliseconds consistently', () => {
    expect(hermesTimestamp(1_785_266_105)).toBe('2026-07-28T19:15:05.000Z');
    expect(hermesTimestamp(1_785_266_105_000)).toBe('2026-07-28T19:15:05.000Z');
  });
});
