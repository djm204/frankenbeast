import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityPane } from './activity-pane';

describe('ActivityPane', () => {
  afterEach(() => cleanup());

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
});
