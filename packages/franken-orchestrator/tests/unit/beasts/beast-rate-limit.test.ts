import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimiter } from '../../../src/beasts/http/beast-rate-limit.js';

function limiterCounterCount(limiter: InMemoryRateLimiter): number {
  return (limiter as unknown as { counters: Map<string, unknown> }).counters.size;
}

describe('InMemoryRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['max', { max: 0, windowMs: 1_000 }],
    ['max', { max: -1, windowMs: 1_000 }],
    ['max', { max: Number.NaN, windowMs: 1_000 }],
    ['max', { max: Number.POSITIVE_INFINITY, windowMs: 1_000 }],
    ['max', { max: 1.5, windowMs: 1_000 }],
    ['max', { max: Number.MAX_SAFE_INTEGER + 1, windowMs: 1_000 }],
    ['windowMs', { max: 1, windowMs: 0 }],
    ['windowMs', { max: 1, windowMs: -1 }],
    ['windowMs', { max: 1, windowMs: Number.NaN }],
    ['windowMs', { max: 1, windowMs: Number.POSITIVE_INFINITY }],
    ['windowMs', { max: 1, windowMs: 1.5 }],
    ['windowMs', { max: 1, windowMs: Number.MAX_SAFE_INTEGER + 1 }],
    ['cleanupBatchSize', { max: 1, windowMs: 1_000, cleanupBatchSize: 0 }],
    ['cleanupBatchSize', { max: 1, windowMs: 1_000, cleanupBatchSize: -1 }],
    ['cleanupBatchSize', { max: 1, windowMs: 1_000, cleanupBatchSize: Number.NaN }],
    ['cleanupBatchSize', { max: 1, windowMs: 1_000, cleanupBatchSize: Number.POSITIVE_INFINITY }],
    ['cleanupBatchSize', { max: 1, windowMs: 1_000, cleanupBatchSize: 1.5 }],
    ['cleanupBatchSize', { max: 1, windowMs: 1_000, cleanupBatchSize: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects invalid numeric option %s', (optionName, options) => {
    expect(() => new InMemoryRateLimiter(options)).toThrow(RangeError);
    expect(() => new InMemoryRateLimiter(options)).toThrow(optionName);
  });

  it('accepts omitted cleanup batch size', () => {
    expect(() => new InMemoryRateLimiter({ max: 1, windowMs: 1 })).not.toThrow();
  });

  it('accepts positive safe integer cleanup batch size', () => {
    expect(() => new InMemoryRateLimiter({ max: 1, windowMs: 1, cleanupBatchSize: 1 })).not.toThrow();
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
