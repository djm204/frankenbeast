import { Hono } from 'hono';
import type { AnalyticsFilters, AnalyticsOutcome, AnalyticsPageRequest, AnalyticsService } from '../../analytics/types.js';

export interface AnalyticsRouteDeps {
  analytics: AnalyticsService;
}

const OUTCOMES = new Set<AnalyticsOutcome>([
  'approved',
  'denied',
  'review_recommended',
  'failed',
  'error',
  'detected',
]);

export function createAnalyticsRoutes(deps: AnalyticsRouteDeps): Hono {
  const app = new Hono();

  app.get('/summary', async (c) => {
    return c.json(await deps.analytics.getSummary(readFilters(c.req.query())));
  });

  app.get('/sessions', async (c) => {
    return c.json({ sessions: await deps.analytics.listSessions(readFilters(c.req.query())) });
  });

  app.get('/events', async (c) => {
    return c.json(await deps.analytics.listEvents(readPageRequest(c.req.query())));
  });

  app.get('/events/:id', async (c) => {
    const event = await deps.analytics.getEvent(c.req.param('id'));
    if (!event) {
      return c.json({ error: { message: 'Analytics event not found' } }, 404);
    }
    return c.json(event);
  });

  return app;
}

function readPageRequest(query: Record<string, string>): AnalyticsPageRequest {
  const filters = readFilters(query);
  const page = readPositiveInteger(query['page']);
  const pageSize = readPositiveInteger(query['pageSize']);

  return {
    ...filters,
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {}),
  };
}

function readFilters(query: Record<string, string>): AnalyticsFilters {
  const outcome = query['outcome'];
  return {
    ...(query['sessionId'] ? { sessionId: query['sessionId'] } : {}),
    ...(query['toolQuery'] ? { toolQuery: query['toolQuery'] } : {}),
    ...(outcome && OUTCOMES.has(outcome as AnalyticsOutcome) ? { outcome: outcome as AnalyticsOutcome } : {}),
    ...(query['timeWindow'] ? { timeWindow: query['timeWindow'] } : {}),
  };
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
