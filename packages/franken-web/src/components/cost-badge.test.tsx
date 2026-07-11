import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CostBadge } from './cost-badge';

describe('CostBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows unavailable telemetry instead of placeholder zero totals', () => {
    render(
      <CostBadge
        tier="pending"
        costTelemetryStatus="unavailable"
        tokenTelemetryStatus="unavailable"
        tokenTotals={{ cheap: 0, premiumReasoning: 0, premiumExecution: 0 }}
        costUsd={0}
      />,
    );

    const summary = within(screen.getByRole('region', { name: 'Cost summary' }));
    expect(summary.getAllByText('Unavailable')).toHaveLength(4);
    expect(summary.getByText('pending')).toBeTruthy();
    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('keeps token totals visible when only spend telemetry is unavailable', () => {
    render(
      <CostBadge
        tier="cheap"
        costTelemetryStatus="unavailable"
        tokenTelemetryStatus="available"
        tokenTotals={{ cheap: 4, premiumReasoning: 0, premiumExecution: 0 }}
        costUsd={0}
      />,
    );

    const summary = within(screen.getByRole('region', { name: 'Cost summary' }));
    expect(summary.getByText('cheap')).toBeTruthy();
    expect(summary.getByText('4')).toBeTruthy();
    expect(summary.getAllByText('0')).toHaveLength(2);
    expect(summary.getByText('Unavailable')).toBeTruthy();
    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('renders reported zero-cost sessions as real zero telemetry', () => {
    render(
      <CostBadge
        tier="cheap"
        costTelemetryStatus="available"
        tokenTelemetryStatus="available"
        tokenTotals={{ cheap: 0, premiumReasoning: 0, premiumExecution: 0 }}
        costUsd={0}
      />,
    );

    const summary = within(screen.getByRole('region', { name: 'Cost summary' }));
    expect(summary.getByText('cheap')).toBeTruthy();
    expect(summary.getAllByText('0')).toHaveLength(3);
    expect(summary.getByText('$0.00')).toBeTruthy();
  });

  it('renders non-zero usage totals when telemetry is available', () => {
    render(
      <CostBadge
        tier="premium_execution"
        costTelemetryStatus="available"
        tokenTelemetryStatus="available"
        tokenTotals={{ cheap: 3, premiumReasoning: 5, premiumExecution: 8 }}
        costUsd={0.42}
      />,
    );

    const summary = within(screen.getByRole('region', { name: 'Cost summary' }));
    expect(summary.getByText('premium_execution')).toBeTruthy();
    expect(summary.getByText('3')).toBeTruthy();
    expect(summary.getByText('5')).toBeTruthy();
    expect(summary.getByText('8')).toBeTruthy();
    expect(summary.getByText('$0.42')).toBeTruthy();
  });
});
