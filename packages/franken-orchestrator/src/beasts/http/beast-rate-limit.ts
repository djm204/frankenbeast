import { createMiddleware } from 'hono/factory';
import { HttpError } from '../../http/middleware.js';
import { wallClockNow } from '@franken/types';

export interface BeastRateLimitOptions {
  max: number;
  windowMs: number;
  cleanupBatchSize?: number;
}

interface CounterState {
  count: number;
  resetAt: number;
}

const DEFAULT_CLEANUP_BATCH_SIZE = 128;

export class InMemoryRateLimiter {
  private readonly counters = new Map<string, CounterState>();

  constructor(private readonly options: BeastRateLimitOptions) {}

  take(key: string): { allowed: boolean; remaining: number } {
    if (this.options.max <= 0) {
      return { allowed: false, remaining: 0 };
    }
    const now = wallClockNow();
    this.evictExpiredCounters(now);
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      this.counters.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs,
      });
      return { allowed: true, remaining: this.options.max - 1 };
    }

    if (current.count >= this.options.max) {
      return { allowed: false, remaining: 0 };
    }

    current.count += 1;
    return { allowed: true, remaining: this.options.max - current.count };
  }

  private evictExpiredCounters(now: number): void {
    const cleanupBatchSize = this.options.cleanupBatchSize ?? DEFAULT_CLEANUP_BATCH_SIZE;
    if (cleanupBatchSize <= 0) {
      return;
    }

    let checked = 0;
    for (const [key, counter] of this.counters) {
      if (checked >= cleanupBatchSize) {
        break;
      }
      checked += 1;
      this.counters.delete(key);
      if (counter.resetAt <= now) {
        continue;
      }
      this.counters.set(key, counter);
    }
  }
}

export function requireBeastRateLimit(
  limiter: InMemoryRateLimiter,
  keyResolver: (authHeader: string | undefined, path: string) => string,
) {
  return createMiddleware(async (c, next) => {
    const key = keyResolver(c.req.header('authorization'), c.req.path);
    const result = limiter.take(key);
    if (!result.allowed) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }
    await next();
  });
}
