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
      { id: 'session-b', lastActivityAt: '2026-04-28T12:02:00.000Z', eventCount: 1, failureCount: 0 },
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
    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy();
    });
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

  it('keeps in-scope session picker options available after selecting one session', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    const select = await screen.findByLabelText('Session');
    expect(screen.getByRole('option', { name: 'session-b' })).toBeTruthy();

    fireEvent.change(select, { target: { value: 'session-a' } });

    await waitFor(() => {
      expect(client.fetchSummary).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a' }));
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a', page: 1 }));
      expect(client.fetchSessions).toHaveBeenLastCalledWith({ timeWindow: '24h' });
    });
    expect(screen.getByRole('option', { name: 'session-b' })).toBeTruthy();
  });

  it('marks summary metrics as updating instead of silently showing stale filter values', async () => {
    const client = mockClient();
    let resolveFilteredSummary!: (summary: Awaited<ReturnType<AnalyticsApiClient['fetchSummary']>>) => void;
    let resolveFilteredSessions!: (sessions: Awaited<ReturnType<AnalyticsApiClient['fetchSessions']>>) => void;
    vi.mocked(client.fetchSummary)
      .mockResolvedValueOnce({
        totalEvents: 3,
        uniqueSessions: 2,
        denialCount: 1,
        errorCount: 1,
        failureCount: 0,
        securityDetectionCount: 1,
        tokenTotals: { prompt: 100, completion: 50, total: 150 },
        costTotals: { usd: 0.25 },
      })
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFilteredSummary = resolve;
      }));
    vi.mocked(client.fetchSessions)
      .mockResolvedValueOnce([
        { id: 'session-a', lastActivityAt: '2026-04-28T12:00:00.000Z', eventCount: 2, failureCount: 1 },
      ])
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFilteredSessions = resolve;
      }));

    render(<AnalyticsPage client={client} />);

    expect(await screen.findByText('Total Events')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Metrics last updated for Last 24h.')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Session'), { target: { value: 'session-a' } });

    expect(screen.getByText('Updating metrics for Session session-a · Last 24h...')).toBeTruthy();
    expect(screen.getByText('Showing previous metric values until refreshed.')).toBeTruthy();
    expect(screen.getByLabelText('Analytics summary').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('3')).toBeTruthy();

    resolveFilteredSummary({
      totalEvents: 1,
      uniqueSessions: 1,
      denialCount: 0,
      errorCount: 0,
      failureCount: 0,
      securityDetectionCount: 0,
      tokenTotals: { prompt: 40, completion: 10, total: 50 },
      costTotals: { usd: 0.1 },
    });
    resolveFilteredSessions([
      { id: 'session-a', lastActivityAt: '2026-04-28T12:00:00.000Z', eventCount: 1, failureCount: 0 },
    ]);

    await waitFor(() => {
      expect(screen.getByLabelText('Analytics summary').getAttribute('aria-busy')).toBe('false');
      expect(screen.getByText('Metrics last updated for Session session-a · Last 24h.')).toBeTruthy();
    });
  });

  it('keeps prior metric values marked stale when a filtered summary refresh fails', async () => {
    const client = mockClient();
    vi.mocked(client.fetchSummary)
      .mockResolvedValueOnce({
        totalEvents: 3,
        uniqueSessions: 2,
        denialCount: 1,
        errorCount: 1,
        failureCount: 0,
        securityDetectionCount: 1,
        tokenTotals: { prompt: 100, completion: 50, total: 150 },
        costTotals: { usd: 0.25 },
      })
      .mockRejectedValueOnce(new Error('summary timeout'));
    vi.mocked(client.fetchSessions)
      .mockResolvedValueOnce([
        { id: 'session-a', lastActivityAt: '2026-04-28T12:00:00.000Z', eventCount: 2, failureCount: 1 },
      ])
      .mockResolvedValueOnce([
        { id: 'session-a', lastActivityAt: '2026-04-28T12:00:00.000Z', eventCount: 2, failureCount: 1 },
      ]);

    render(<AnalyticsPage client={client} />);
    await screen.findByText('Metrics last updated for Last 24h.');

    fireEvent.change(screen.getByLabelText('Session'), { target: { value: 'session-a' } });

    expect(await screen.findByText('summary timeout')).toBeTruthy();
    expect(screen.getByText('Metric values are still from Last 24h; refresh for Session session-a · Last 24h failed or is incomplete.')).toBeTruthy();
    expect(screen.getByText('Showing previous metric values until refreshed.')).toBeTruthy();
    expect(screen.queryByText('Updating')).toBeNull();
    expect(screen.getAllByText('Stale').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Analytics summary').getAttribute('aria-busy')).toBe('false');
    expect(screen.getByText('3')).toBeTruthy();
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

  it('opens event details in a labelled modal dialog and focuses the close button', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Denied destructive command' }));

    const dialog = await screen.findByRole('dialog', { name: 'Denied destructive command' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('"decision": "denied"')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBe(document.activeElement);
    expect(client.fetchEventDetail).toHaveBeenCalledWith('governor:1');
  });

  it('announces when full event JSON is copied to the clipboard', async () => {
    const client = mockClient();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Denied destructive command' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy JSON' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{\n  "decision": "denied"\n}');
    });
    expect(await screen.findByText('Copied JSON to clipboard.')).toBeTruthy();
  });

  it('shows a manual fallback when copying full event JSON is unavailable', async () => {
    const client = mockClient();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Denied destructive command' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy JSON' }));

    expect(await screen.findByText('Clipboard is unavailable. Select the JSON below and copy it manually.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Raw JSON manual copy fallback' })).toHaveProperty('value', '{\n  "decision": "denied"\n}');
  });

  it('shows a manual fallback when copying full event JSON is rejected', async () => {
    const client = mockClient();
    const writeText = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Denied destructive command' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy JSON' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{\n  "decision": "denied"\n}');
    });
    expect(await screen.findByText('Copy failed. Select the JSON below and copy it manually.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Raw JSON manual copy fallback' })).toHaveProperty('value', '{\n  "decision": "denied"\n}');
  });

  it('labels row data as partial and disables JSON copy until full detail loads', async () => {
    const client = mockClient();
    let resolveDetail!: (event: Awaited<ReturnType<AnalyticsApiClient['fetchEventDetail']>>) => void;
    vi.mocked(client.fetchEventDetail).mockReturnValueOnce(new Promise((resolve) => {
      resolveDetail = resolve;
    }));

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Denied destructive command' }));

    expect(await screen.findByText('Partial row data')).toBeTruthy();
    expect(screen.getByText('Loading full event detail; the fields below are from the selected table row.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Copy JSON is available after full event detail loads.')).toBeTruthy();

    resolveDetail({
      id: 'governor:1',
      timestamp: '2026-04-28T12:01:00.000Z',
      sessionId: 'session-a',
      toolName: 'exec_command',
      source: 'governor',
      category: 'decision',
      outcome: 'denied',
      summary: 'Denied destructive command',
      severity: 'error',
      raw: { decision: 'denied', full: true },
      links: {},
    });

    expect(await screen.findByText('Full event detail')).toBeTruthy();
    expect(screen.getByText('This drawer is showing the full analytics event detail.')).toBeTruthy();
    expect(screen.getByText('"full": true')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toHaveProperty('disabled', false);
  });

  it('keeps failed details labelled as partial and offers retry', async () => {
    const client = mockClient();
    vi.mocked(client.fetchEventDetail).mockRejectedValueOnce(new Error('detail timeout'));

    render(<AnalyticsPage client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Denied destructive command' }));

    expect(await screen.findByText('detail timeout')).toBeTruthy();
    expect(screen.getByText('Partial row data')).toBeTruthy();
    expect(screen.getByText('Full event detail is not loaded; the fields below are only from the selected table row.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Retry detail' }));

    expect(await screen.findByText('Full event detail')).toBeTruthy();
    expect(screen.queryByText('detail timeout')).toBeNull();
    expect(client.fetchEventDetail).toHaveBeenCalledTimes(2);
  });

  it('opens details from the row action and restores focus to the action when closed', async () => {
    const client = mockClient();

    render(<AnalyticsPage client={client} />);
    const detailButton = await screen.findByRole('button', { name: 'View details for Denied destructive command' });
    detailButton.focus();

    fireEvent.click(detailButton);
    expect(await screen.findByRole('dialog', { name: 'Denied destructive command' })).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(detailButton);
    });
  });

  it('restores focus to the re-rendered action after applying the detail session filter', async () => {
    const client = mockClient();
    vi.mocked(client.fetchEvents)
      .mockResolvedValueOnce({
        total: 1,
        page: 1,
        pageSize: 50,
        events: [
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
      })
      .mockResolvedValueOnce({
        total: 1,
        page: 1,
        pageSize: 50,
        events: [
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
      });

    render(<AnalyticsPage client={client} />);
    const detailButton = await screen.findByRole('button', { name: 'View details for Denied destructive command' });
    fireEvent.click(detailButton);
    expect(await screen.findByRole('dialog', { name: 'Denied destructive command' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Filter Session' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(client.fetchEvents).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'session-a' }));
      expect(client.fetchSessions).toHaveBeenLastCalledWith({ timeWindow: '24h' });
      expect(screen.getByRole('option', { name: 'session-b' })).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View details for Denied destructive command' }));
    });
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
