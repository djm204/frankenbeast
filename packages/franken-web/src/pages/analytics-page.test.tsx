import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPage } from './analytics-page';
import type { AnalyticsApiClient, AnalyticsEventPage } from '../lib/analytics-api';

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
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a', page: 1 }));
    });
  });

  it('navigates event pages and exposes disabled pagination states', async () => {
    const client = mockClient();
    let resolveSecondPage!: (page: AnalyticsEventPage) => void;
    const secondPage = new Promise<AnalyticsEventPage>((resolve) => {
      resolveSecondPage = resolve;
    });
    vi.mocked(client.fetchEvents)
      .mockResolvedValueOnce({ total: 75, page: 1, pageSize: 50, events: [] })
      .mockReturnValueOnce(secondPage);

    render(<AnalyticsPage client={client} />);

    const previous = await screen.findByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(previous).toHaveProperty('disabled', true);
    expect(next).toHaveProperty('disabled', false);
    expect(screen.getByText('Page 1 of 2 · 75 events')).toBeTruthy();

    fireEvent.click(next);

    await waitFor(() => {
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 50 }));
    });
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Loading analytics...')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(client.fetchEvents).toHaveBeenCalledTimes(2);

    resolveSecondPage({ total: 75, page: 2, pageSize: 50, events: [] });
    expect(await screen.findByText('Page 2 of 2 · 75 events')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });

  it('only refetches events for pagination changes', async () => {
    const client = mockClient();
    vi.mocked(client.fetchEvents)
      .mockResolvedValueOnce({ total: 75, page: 1, pageSize: 50, events: [] })
      .mockResolvedValueOnce({ total: 75, page: 2, pageSize: 50, events: [] })
      .mockResolvedValueOnce({ total: 75, page: 1, pageSize: 25, events: [] });

    render(<AnalyticsPage client={client} />);
    await screen.findByText('Page 1 of 2 · 75 events');

    expect(client.fetchSummary).toHaveBeenCalledTimes(1);
    expect(client.fetchSessions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 50 }));
    });

    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: '25' } });
    await waitFor(() => {
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }));
    });

    expect(client.fetchSummary).toHaveBeenCalledTimes(1);
    expect(client.fetchSessions).toHaveBeenCalledTimes(1);
  });

  it('clears stale events when a page fetch fails', async () => {
    const client = mockClient();
    vi.mocked(client.fetchEvents)
      .mockResolvedValueOnce({
        total: 75,
        page: 1,
        pageSize: 50,
        events: [
          {
            id: 'audit:first-page',
            timestamp: '2026-04-28T12:00:00.000Z',
            sessionId: 'session-a',
            toolName: 'fbeast_observer_log',
            source: 'observer',
            category: 'tool_call',
            outcome: 'approved',
            summary: 'First page event',
            severity: 'info',
            raw: { event: 'tool_call' },
            links: {},
          },
        ],
      })
      .mockRejectedValueOnce(new Error('HTTP 500'));

    render(<AnalyticsPage client={client} />);
    expect(await screen.findByText('First page event')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('HTTP 500')).toBeTruthy();
    expect(screen.queryByText('First page event')).toBeNull();
    expect(screen.getByText('Page 2 of 2 · 75 events')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', false);
  });

  it('resets to the first page when filters or page size change', async () => {
    const client = mockClient();
    vi.mocked(client.fetchEvents)
      .mockResolvedValueOnce({ total: 75, page: 1, pageSize: 50, events: [] })
      .mockResolvedValueOnce({ total: 75, page: 2, pageSize: 50, events: [] })
      .mockResolvedValueOnce({ total: 1, page: 1, pageSize: 50, events: [] })
      .mockResolvedValueOnce({ total: 1, page: 1, pageSize: 25, events: [] });

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    fireEvent.change(screen.getByLabelText('Session'), { target: { value: 'session-a' } });
    await waitFor(() => {
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a', page: 1, pageSize: 50 }));
    });

    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: '25' } });
    await waitFor(() => {
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a', page: 1, pageSize: 25 }));
    });
  });

  it('opens a read-only drawer from a visible event details action', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open details for Denied destructive command' }));

    expect(await screen.findByRole('dialog', { name: 'Analytics event detail' })).toBeTruthy();
    expect(screen.getByText('"decision": "denied"')).toBeTruthy();
    expect(client.fetchEventDetail).toHaveBeenCalledWith('governor:1');
  });

  it('lets keyboard users open event details with the event action', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    const detailsAction = await screen.findByRole('button', { name: 'Open details for Denied destructive command' });

    detailsAction.focus();
    expect(document.activeElement).toBe(detailsAction);
    fireEvent.keyDown(detailsAction, { key: 'Enter', code: 'Enter' });
    fireEvent.click(detailsAction);

    expect(await screen.findByRole('dialog', { name: 'Analytics event detail' })).toBeTruthy();
    expect(client.fetchEventDetail).toHaveBeenCalledWith('governor:1');
  });

  it('keeps successful analytics sections visible when one endpoint fails', async () => {
    const client = mockClient();
    vi.mocked(client.fetchSessions).mockRejectedValueOnce(new Error('HTTP 503'));

    render(<AnalyticsPage client={client} />);

    expect(await screen.findByText('fbeast_observer_log')).toBeTruthy();
    expect(screen.getByText('Denied destructive command')).toBeTruthy();
    expect(screen.getByText('HTTP 503')).toBeTruthy();
  });
});
