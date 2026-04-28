import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPage } from './analytics-page';
import type { AnalyticsApiClient } from '../lib/analytics-api';

function mockClient(): AnalyticsApiClient {
  return {
    fetchSummary: vi.fn().mockResolvedValue({
      totalEvents: 3,
      uniqueSessions: 2,
      denialCount: 1,
      errorCount: 1,
      failureCount: 0,
      securityDetectionCount: 1,
      tokenTotals: { prompt: 100, completion: 50, total: 150 },
      costTotals: { usd: 0.25 },
    }),
    fetchSessions: vi.fn().mockResolvedValue([
      { id: 'session-a', lastActivityAt: '2026-04-28T12:00:00.000Z', eventCount: 2, failureCount: 1 },
    ]),
    fetchEvents: vi.fn().mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: 50,
      events: [
        {
          id: 'audit:1',
          timestamp: '2026-04-28T12:00:00.000Z',
          sessionId: 'session-a',
          toolName: 'fbeast_observer_log',
          source: 'observer',
          category: 'tool_call',
          outcome: 'approved',
          summary: 'Logged audit event',
          severity: 'info',
          raw: { event: 'tool_call' },
          links: {},
        },
        {
          id: 'governor:1',
          timestamp: '2026-04-28T12:01:00.000Z',
          sessionId: 'session-a',
          toolName: 'exec_command',
          source: 'governor',
          category: 'decision',
          outcome: 'denied',
          summary: 'Denied destructive command',
          severity: 'error',
          raw: { decision: 'denied' },
          links: {},
        },
      ],
    }),
    fetchEventDetail: vi.fn().mockResolvedValue({
      id: 'governor:1',
      timestamp: '2026-04-28T12:01:00.000Z',
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
  } as unknown as AnalyticsApiClient;
}

describe('AnalyticsPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders summary cards and splits activity from abnormal events', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);

    expect(await screen.findByText('Total Events')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Decisions & Failures')).toBeTruthy();
    expect(screen.getByText('fbeast_observer_log')).toBeTruthy();
    expect(screen.getByText('Denied destructive command')).toBeTruthy();
  });

  it('refetches when session filter changes', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    const select = await screen.findByLabelText('Session');

    fireEvent.change(select, { target: { value: 'session-a' } });

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a' }));
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a' }));
    });
  });

  it('opens a read-only drawer with raw details when a row is selected', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByText('Denied destructive command'));

    expect(await screen.findByRole('dialog', { name: 'Analytics event detail' })).toBeTruthy();
    expect(screen.getByText('"decision": "denied"')).toBeTruthy();
    expect(client.fetchEventDetail).toHaveBeenCalledWith('governor:1');
  });
});
