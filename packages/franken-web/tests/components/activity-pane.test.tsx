import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ActivityPane } from '../../src/components/activity-pane';
import type { ActivityEvent } from '../../src/hooks/use-chat-session';

afterEach(cleanup);

describe('ActivityPane', () => {
  it('renders circular event payloads with explicit circular markers', () => {
    const circular: Record<string, unknown> = { message: 'circular runtime payload' };
    circular.self = circular;

    const events: ActivityEvent[] = [
      {
        type: 'turn.execution.start',
        data: circular,
        timestamp: '2026-07-10T10:00:00.000Z',
      },
    ];

    render(<ActivityPane events={events} />);

    expect(screen.getByText('Raw event details')).toBeTruthy();
    expect(screen.getByText((text) => text.includes('[Circular]'))).toBeTruthy();
  });

  it('falls back to an explicit message when event data cannot be stringified', () => {
    const badJson = {
      message: 'cannot stringify',
      toJSON: () => {
        throw new Error('serialize error');
      },
    };

    const events: ActivityEvent[] = [
      {
        type: 'turn.execution.start',
        data: badJson as unknown as Record<string, unknown>,
        timestamp: '2026-07-10T12:00:00.000Z',
      },
    ];

    render(<ActivityPane events={events} />);

    expect(screen.getByText('[unserializable event data]')).toBeTruthy();
  });

  it('renders bigint event values with a clear string representation', () => {
    const events: ActivityEvent[] = [
      {
        type: 'turn.execution.complete',
        data: {
          summary: 'execution complete',
          messageCount: 12n,
        },
        timestamp: '2026-07-10T11:00:00.000Z',
      },
    ];

    render(<ActivityPane events={events} />);

    expect(screen.getByText((text) => text.includes('BigInt(12)'))).toBeTruthy();
  });

  it('does not mark repeated sibling references as circular', () => {
    const shared = { message: 'shared runtime payload' };
    const events: ActivityEvent[] = [
      {
        type: 'turn.execution.start',
        data: {
          first: shared,
          second: shared,
        },
        timestamp: '2026-07-10T13:00:00.000Z',
      },
    ];

    render(<ActivityPane events={events} />);

    expect(screen.getByText((text) => text.includes('"first"') && text.includes('"second"'))).toBeTruthy();
    expect(screen.queryByText((text) => text.includes('[Circular]'))).toBeNull();
  });
});
