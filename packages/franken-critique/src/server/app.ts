import { Hono } from 'hono';
import { z } from 'zod';
import type { CritiquePipeline } from '../pipeline/critique-pipeline.js';
import { wallClockNow } from '@franken/types';
import { timingSafeBearerTokenMatches } from './token-auth.js';

const ReviewRequestSchema = z.object({
  code: z.string(),
  context: z.record(z.unknown()).optional(),
  evaluators: z.array(z.string()).optional(),
});

export interface CritiqueAppOptions {
  bearerToken?: string;
  rateLimitPerMinute?: number;
  pipeline?: CritiquePipeline;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_MAX_BUCKETS = 10_000;

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export function evictExpiredRateLimitBuckets(
  requestCounts: Map<string, RateLimitBucket>,
  now: number,
): void {
  for (const [ip, bucket] of requestCounts) {
    if (bucket.resetAt <= now) {
      requestCounts.delete(ip);
    }
  }
}

export function evictOldestRateLimitBucket(
  requestCounts: Map<string, RateLimitBucket>,
): void {
  let oldestIp: string | undefined;
  let oldestResetAt = Infinity;

  for (const [ip, bucket] of requestCounts) {
    if (bucket.resetAt < oldestResetAt) {
      oldestIp = ip;
      oldestResetAt = bucket.resetAt;
    }
  }

  if (oldestIp !== undefined) {
    requestCounts.delete(oldestIp);
  }
}

export function createCritiqueApp(options: CritiqueAppOptions = {}): Hono {
  const app = new Hono();
  const requestCounts = new Map<string, RateLimitBucket>();
  let nextRateLimitCleanupAt = 0;

  // Bearer auth middleware
  const bearerToken = options.bearerToken;
  if (bearerToken) {
    app.use('/v1/*', async (c, next) => {
      const auth = c.req.header('Authorization');
      if (!timingSafeBearerTokenMatches(auth, bearerToken)) {
        return c.json(
          { error: { message: 'Unauthorized', type: 'auth_error' } },
          401,
        );
      }
      return next();
    });
  }

  // Rate limiting middleware. Expired buckets are swept at a fixed cadence and
  // the active bucket map has a hard cap so high-cardinality forwarded-address
  // traffic cannot force an O(bucket count) scan on every request.
  if (options.rateLimitPerMinute) {
    const limit = options.rateLimitPerMinute;
    app.use('/v1/*', async (c, next) => {
      const ip = c.req.header('x-forwarded-for') ?? 'unknown';
      const now = wallClockNow();
      if (now >= nextRateLimitCleanupAt) {
        evictExpiredRateLimitBuckets(requestCounts, now);
        nextRateLimitCleanupAt = now + RATE_LIMIT_CLEANUP_INTERVAL_MS;
      }
      const entry = requestCounts.get(ip);

      if (entry && entry.resetAt > now) {
        if (entry.count >= limit) {
          return c.json(
            { error: { message: 'Rate limit exceeded', type: 'rate_limit' } },
            429,
          );
        }
        entry.count++;
      } else {
        requestCounts.set(ip, {
          count: 1,
          resetAt: now + RATE_LIMIT_WINDOW_MS,
        });
        if (requestCounts.size > RATE_LIMIT_MAX_BUCKETS) {
          evictOldestRateLimitBucket(requestCounts);
        }
      }

      return next();
    });
  }

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'franken-critique',
      pipelineConfigured: options.pipeline !== undefined,
    });
  });

  // POST /v1/review — submit code for critique
  app.post('/v1/review', async (c) => {
    const body = await c.req.json();
    const parsed = ReviewRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: { message: 'Invalid request', details: parsed.error.issues } },
        400,
      );
    }

    if (!options.pipeline) {
      return c.json(
        {
          error: {
            message: 'No critique pipeline configured',
            type: 'config_error',
          },
        },
        503,
      );
    }

    const result = await options.pipeline.run({
      content: parsed.data.code,
      metadata: parsed.data.context ?? {},
    });

    return c.json({
      verdict: result.verdict,
      score: result.overallScore,
      findings: result.results.flatMap((r) =>
        r.findings.map((f) => ({
          evaluator: r.evaluatorName,
          severity: f.severity,
          message: f.message,
          location: f.location,
          suggestion: f.suggestion,
        })),
      ),
      evaluatorsRun: result.results.map((r) => r.evaluatorName),
      shortCircuited: result.shortCircuited,
    });
  });

  return app;
}
