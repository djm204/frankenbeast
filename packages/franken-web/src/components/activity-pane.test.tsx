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
            data: { message: 'Running plan', runId: 'run-42', sessionId: 'session-7' },
            timestamp: '2026-07-05T01:02:03.000Z',
          },
          {
            type: 'turn.approval.requested',
            data: { description: 'Run npm test', risk: 'medium', artifactPath: '/tmp/report.md' },
            timestamp: '2026-07-05T01:03:04.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Execution started')).toBeTruthy();
    expect(screen.getByText('Running plan')).toBeTruthy();
    expect(screen.getByText('Approval needed')).toBeTruthy();
    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Medium risk')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Session session-7' }).getAttribute('href')).toBe('#/sessions/session-7');
    expect(screen.getByRole('link', { name: 'Run run-42' }).getAttribute('href')).toBe('#/runs/run-42');
    expect(screen.getByRole('link', { name: 'Artifact /tmp/report.md' }).getAttribute('href')).toBe('#/artifacts?path=%2Ftmp%2Freport.md');
    expect(screen.queryByText('{"message":"Running plan"}')).toBeNull();
  });
});
