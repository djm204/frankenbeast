import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityPane } from './activity-pane';

function setScrollMetrics(element: Element, metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(element, 'scrollTop', { configurable: true, value: metrics.scrollTop });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: metrics.clientHeight });
}

describe('ActivityPane', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('summarizes turn errors and keeps raw data behind details', () => {
    render(
      <ActivityPane
        events={[
          {
            type: 'turn.error',
            data: { code: 'TOOL_DENIED', message: 'Approval denied by policy.', traceId: 'trace-1' },
            timestamp: '2026-07-05T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('TOOL_DENIED: Approval denied by policy.')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('Jul 5, 2026, 12:00 AM')).toBeTruthy();
    expect(screen.getByText('Raw event details')).toBeTruthy();
    expect(screen.getByText(/"traceId": "trace-1"/)).toBeTruthy();
  });

  it('renders runtime activity as a readable timeline with status chips and artifact links', () => {
    render(
      <ActivityPane
        events={[
          {
            type: 'turn.execution.start',
            data: { taskDescription: 'Deploy agent', runId: 'run-42', sessionId: 'session-7' },
            timestamp: '2026-07-05T01:02:03.000Z',
          },
          {
            type: 'turn.approval.requested',
            data: { description: 'Run npm test', risk: 'medium', artifactPath: '/tmp/report.md' },
            timestamp: '2026-07-05T01:03:04.000Z',
          },
          {
            type: 'turn.execution.complete',
            data: { status: 'failed', summary: 'Tests failed' },
            timestamp: '2026-07-05T01:04:05.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Execution started')).toBeTruthy();
    expect(screen.getByText('Deploy agent')).toBeTruthy();
    expect(screen.getByText('Approval needed')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Medium risk')).toBeTruthy();
    expect(screen.getByText('Execution complete')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Tests failed')).toBeTruthy();
    expect(screen.getByText('Session session-7')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Session session-7' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Run run-42' }).getAttribute('href')).toBe('#/beasts');
    expect(screen.getByText('Artifact /tmp/report.md')).toBeTruthy();
    expect(screen.queryByText('{"taskDescription":"Deploy agent"}')).toBeNull();
  });

  it('preserves scroll position and offers a jump button when new activity arrives while scrolled up', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const firstEvent = { type: 'turn.execution.start', data: { message: 'Started' }, timestamp: '2026-07-05T00:00:00.000Z' };
    const { container, rerender } = render(<ActivityPane events={[firstEvent]} />);
    scrollIntoView.mockClear();

    const list = container.querySelector('.activity-list');
    expect(list).toBeTruthy();
    setScrollMetrics(list!, { scrollHeight: 900, scrollTop: 120, clientHeight: 300 });
    fireEvent.scroll(list!);

    rerender(
      <ActivityPane
        events={[
          firstEvent,
          { type: 'turn.execution.complete', data: { message: 'Done' }, timestamp: '2026-07-05T00:00:01.000Z' },
        ]}
      />,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    const jumpButton = screen.getByRole('button', { name: /new activity/i });
    expect(jumpButton).toBeTruthy();

    fireEvent.click(jumpButton);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' });
  });

  it('does not show a jump button when the user scrolls up before new activity arrives', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    const { container } = render(
      <ActivityPane events={[{ type: 'turn.execution.start', data: { message: 'Started' }, timestamp: '2026-07-05T00:00:00.000Z' }]} />,
    );

    const list = container.querySelector('.activity-list');
    expect(list).toBeTruthy();
    setScrollMetrics(list!, { scrollHeight: 900, scrollTop: 120, clientHeight: 300 });
    fireEvent.scroll(list!);

    expect(screen.queryByRole('button', { name: /new activity/i })).toBeNull();
  });

  it('does not auto-scroll an empty activity rail', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });

    render(<ActivityPane events={[]} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
