import { Hono } from 'hono';
import type { Context } from 'hono';
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
const TIME_WINDOWS = ['24h', '7d', '30d', 'all'] as const;
const TIME_WINDOW_SET = new Set<string>(TIME_WINDOWS);

type FilterValidationError = 'invalid_time_window' | 'invalid_outcome';
type FiltersResult = { ok: true; filters: AnalyticsFilters } | { ok: false; reason: FilterValidationError };
type PageRequestResult =
  | { ok: true; request: AnalyticsPageRequest }
  | { ok: false; reason: FilterValidationError }
  | { ok: false; reason: 'invalid_pagination'; parameter: 'page' | 'pageSize' };

export function createAnalyticsRoutes(deps: AnalyticsRouteDeps): Hono {
  const app = new Hono();

  app.get('/summary', async (c) => {
    const result = readFilters(c.req.query());
    if (!result.ok) return invalidFilter(c, result.reason);
    return c.json(await deps.analytics.getSummary(result.filters));
  });

  app.get('/sessions', async (c) => {
    const result = readFilters(c.req.query());
    if (!result.ok) return invalidFilter(c, result.reason);
    return c.json({ sessions: await deps.analytics.listSessions(result.filters) });
  });

  app.get('/events', async (c) => {
    const result = readPageRequest(c.req.query());
    if (!result.ok) {
      return result.reason === 'invalid_pagination' ? invalidPagination(c, result.parameter) : invalidFilter(c, result.reason);
    }
    return c.json(await deps.analytics.listEvents(result.request));
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

function readPageRequest(query: Record<string, string>): PageRequestResult {
  const filters = readFilters(query);
  if (!filters.ok) {
    return { ok: false, reason: filters.reason };
  }
  const page = readPositiveInteger(query['page']);
  if (!page.ok) {
    return { ok: false, reason: 'invalid_pagination', parameter: 'page' };
  }
  const pageSize = readPositiveInteger(query['pageSize']);
  if (!pageSize.ok) {
    return { ok: false, reason: 'invalid_pagination', parameter: 'pageSize' };
  }

  return {
    ok: true,
    request: {
      ...filters.filters,
      ...(page.value ? { page: page.value } : {}),
      ...(pageSize.value ? { pageSize: pageSize.value } : {}),
    },
  };
}

function readFilters(query: Record<string, string>): FiltersResult {
  const outcome = query['outcome'];
  const timeWindow = query['timeWindow'];
  if (timeWindow && !TIME_WINDOW_SET.has(timeWindow)) {
    return { ok: false, reason: 'invalid_time_window' };
  }
  if (outcome && !OUTCOMES.has(outcome as AnalyticsOutcome)) {
    return { ok: false, reason: 'invalid_outcome' };
  }
  return {
    ok: true,
    filters: {
      ...(query['sessionId'] ? { sessionId: query['sessionId'] } : {}),
      ...(query['toolQuery'] ? { toolQuery: query['toolQuery'] } : {}),
      ...(outcome ? { outcome: outcome as AnalyticsOutcome } : {}),
      ...(timeWindow ? { timeWindow } : {}),
    },
  };
}

function invalidFilter(c: Context, reason: FilterValidationError) {
  return reason === 'invalid_outcome' ? invalidOutcome(c) : invalidTimeWindow(c);
}

function invalidTimeWindow(c: Context) {
  return c.json({
    error: {
      message: 'Unsupported Analytics timeWindow filter',
      code: 'invalid_time_window',
      allowedValues: TIME_WINDOWS,
    },
  }, 400);
}

function invalidOutcome(c: Context) {
  return c.json({
    error: {
      message: 'Unsupported Analytics outcome filter',
      code: 'invalid_outcome',
      allowedValues: [...OUTCOMES],
    },
  }, 400);
}

function invalidPagination(c: Context, parameter: 'page' | 'pageSize') {
  return c.json({
    error: {
      message: 'Invalid Analytics pagination parameter',
      code: 'invalid_pagination',
      parameter,
      expected: 'positive integer',
    },
  }, 400);
}

type PositiveIntegerResult = { ok: true; value?: number } | { ok: false };

function readPositiveInteger(value: string | undefined): PositiveIntegerResult {
  if (value === undefined || value === '') {
    return { ok: true };
  }
  if (!/^[1-9]\d*$/.test(value)) {
    return { ok: false };
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? { ok: true, value: parsed } : { ok: false };
}
