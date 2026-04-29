import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsRoutes } from '../../../src/http/routes/analytics-routes.js';
import type { AnalyticsService } from '../../../src/analytics/types.js';

function mockAnalyticsService(): AnalyticsService {
  return {
    getSummary: vi.fn().mockResolvedValue({
      totalEvents: 2,
      uniqueSessions: 1,
      denialCount: 1,
      errorCount: 0,
      failureCount: 0,
      securityDetectionCount: 0,
      tokenTotals: { prompt: 10, completion: 5, total: 15 },
      costTotals: { usd: 0.12 },
    }),
    listSessions: vi.fn().mockResolvedValue([
      { id: 'session-a', lastActivityAt: '2026-04-28T12:00:00.000Z', eventCount: 2, failureCount: 1 },
    ]),
    listEvents: vi.fn().mockResolvedValue({
      events: [
        {
          id: 'governor:1',
          timestamp: '2026-04-28T12:00:00.000Z',
          sessionId: 'session-a',
          toolName: 'exec_command',
          source: 'governor',
          category: 'decision',
          outcome: 'denied',
          summary: 'Denied destructive command',
          severity: 'error',
          raw: {},
          links: {},
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    }),
    getEvent: vi.fn().mockResolvedValue({
      id: 'governor:1',
      timestamp: '2026-04-28T12:00:00.000Z',
      sessionId: 'session-a',
      toolName: 'exec_command',
      source: 'governor',
      category: 'decision',
      outcome: 'denied',
      summary: 'Denied destructive command',
      severity: 'error',
      raw: { decision: 'denied' },
      links: {},
    }),
  };
}

describe('analytics routes', () => {
  it('returns summary with query filters passed through', async () => {
    const service = mockAnalyticsService();
    const app = createAnalyticsRoutes({ analytics: service });

    const res = await app.request('/summary?sessionId=session-a&toolQuery=exec&outcome=denied&timeWindow=24h');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ totalEvents: 2, denialCount: 1 });
    expect(service.getSummary).toHaveBeenCalledWith({
      sessionId: 'session-a',
      toolQuery: 'exec',
      outcome: 'denied',
      timeWindow: '24h',
    });
  });

  it('returns paged normalized events', async () => {
    const service = mockAnalyticsService();
    const app = createAnalyticsRoutes({ analytics: service });

    const res = await app.request('/events?page=2&pageSize=25');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 1, events: [expect.objectContaining({ id: 'governor:1' })] });
    expect(service.listEvents).toHaveBeenCalledWith({ page: 2, pageSize: 25 });
  });

  it('returns event details or a 404', async () => {
    const service = mockAnalyticsService();
    const app = createAnalyticsRoutes({ analytics: service });

    const found = await app.request('/events/governor%3A1');
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ id: 'governor:1', raw: { decision: 'denied' } });

    vi.mocked(service.getEvent).mockResolvedValueOnce(null);
    const missing = await app.request('/events/missing');
    expect(missing.status).toBe(404);
  });
});
