import { createMiddleware } from 'hono/factory';
import { HttpError } from '../../http/middleware.js';

export interface BeastRateLimitOptions {
  max: number;
  windowMs: number;
}

interface CounterState {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly counters = new Map<string, CounterState>();

  constructor(private readonly options: BeastRateLimitOptions) {}

  take(key: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
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
