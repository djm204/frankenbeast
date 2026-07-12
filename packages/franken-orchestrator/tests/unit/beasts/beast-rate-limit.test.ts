import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimiter } from '../../../src/beasts/http/beast-rate-limit.js';

function limiterCounterCount(limiter: InMemoryRateLimiter): number {
  return (limiter as unknown as { counters: Map<string, unknown> }).counters.size;
}

describe('InMemoryRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts expired one-shot counters when a different key is used later', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T00:00:00.000Z'));

    const limiter = new InMemoryRateLimiter({ max: 2, windowMs: 1_000 });

    expect(limiter.take('operator-a:/beasts')).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.take('operator-b:/beasts')).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.take('operator-c:/beasts')).toEqual({ allowed: true, remaining: 1 });
    expect(limiterCounterCount(limiter)).toBe(3);

    vi.setSystemTime(new Date('2026-07-11T00:00:01.001Z'));

    expect(limiter.take('operator-d:/beasts')).toEqual({ allowed: true, remaining: 1 });

    expect(limiterCounterCount(limiter)).toBe(1);
  });

  it('preserves active-key limiting semantics while counters are inside the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T00:00:00.000Z'));

    const limiter = new InMemoryRateLimiter({ max: 2, windowMs: 1_000 });

    expect(limiter.take('operator-a:/beasts')).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.take('operator-a:/beasts')).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.take('operator-a:/beasts')).toEqual({ allowed: false, remaining: 0 });
    expect(limiterCounterCount(limiter)).toBe(1);
  });
});
