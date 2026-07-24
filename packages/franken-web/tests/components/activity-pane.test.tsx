import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ActivityPane } from '../../src/components/activity-pane.js';

afterEach(() => {
  cleanup();
});

describe('ActivityPane', () => {
  it('renders section with explicit ARIA landmark role="region" and aria-label="Activity"', () => {
    render(<ActivityPane events={[]} />);

    const region = screen.getByRole('region', { name: 'Activity' });
    expect(region).toBeDefined();
    expect(region.tagName.toLowerCase()).toBe('section');
  });

  it('renders empty waiting message when events array is empty', () => {
    render(<ActivityPane events={[]} />);

    expect(screen.getByText('Waiting for execution events.')).toBeDefined();
  });

  it('renders activity events when provided', () => {
    const events = [
      {
        type: 'turn.execution.start',
        timestamp: '2026-03-09T00:00:03Z',
        data: { taskDescription: 'Deploying' },
      },
    ];

    render(<ActivityPane events={events} />);

    expect(screen.getByText('turn.execution.start')).toBeDefined();
    expect(screen.queryByText('Waiting for execution events.')).toBeNull();
  });
});
