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
    expect(screen.getByText('Raw event details')).toBeTruthy();
    expect(screen.getByText(/"traceId": "trace-1"/)).toBeTruthy();
  });

  it('preserves scroll position and offers a jump button when new activity arrives while scrolled up', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const firstEvent = { type: 'turn.started', data: { message: 'Started' }, timestamp: '2026-07-05T00:00:00.000Z' };
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
          { type: 'turn.completed', data: { message: 'Done' }, timestamp: '2026-07-05T00:00:01.000Z' },
        ]}
      />,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    const jumpButton = screen.getByRole('button', { name: /new activity/i });
    expect(jumpButton).toBeTruthy();

    fireEvent.click(jumpButton);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' });
  });
});
