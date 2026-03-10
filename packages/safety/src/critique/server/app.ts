import { Hono } from 'hono';
import { z } from 'zod';
import type { CritiquePipeline } from '../pipeline/critique-pipeline.js';

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

export function createCritiqueApp(options: CritiqueAppOptions = {}): Hono {
  const app = new Hono();
  const requestCounts = new Map<string, { count: number; resetAt: number }>();

  // Bearer auth middleware
  if (options.bearerToken) {
    app.use('/v1/*', async (c, next) => {
      const auth = c.req.header('Authorization');
      if (!auth || auth !== `Bearer ${options.bearerToken}`) {
        return c.json({ error: { message: 'Unauthorized', type: 'auth_error' } }, 401);
      }
      return next();
    });
  }

  // Rate limiting middleware
  if (options.rateLimitPerMinute) {
    const limit = options.rateLimitPerMinute;
    app.use('/v1/*', async (c, next) => {
      const ip = c.req.header('x-forwarded-for') ?? 'unknown';
      const now = Date.now();
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
        requestCounts.set(ip, { count: 1, resetAt: now + 60_000 });
      }

      return next();
    });
  }

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: '@franken/safety/critique',
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
        { error: { message: 'No critique pipeline configured', type: 'config_error' } },
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
      findings: result.results.flatMap(r =>
        r.findings.map(f => ({
          evaluator: r.evaluatorName,
          severity: f.severity,
          message: f.message,
          location: f.location,
          suggestion: f.suggestion,
        })),
      ),
      evaluatorsRun: result.results.map(r => r.evaluatorName),
      shortCircuited: result.shortCircuited,
    });
  });

  return app;
}
