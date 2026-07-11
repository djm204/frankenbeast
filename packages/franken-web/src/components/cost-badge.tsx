export interface CostBadgeProps {
  tier: string;
  costTelemetryStatus: 'available' | 'unavailable';
  tokenTelemetryStatus: 'available' | 'unavailable';
  tokenTotals: {
    cheap: number;
    premiumReasoning: number;
    premiumExecution: number;
  };
  costUsd: number;
}

export function CostBadge({ tier, costTelemetryStatus, tokenTelemetryStatus, tokenTotals, costUsd }: CostBadgeProps) {
  const costTelemetryUnavailable = costTelemetryStatus === 'unavailable';
  const tokenTelemetryUnavailable = tokenTelemetryStatus === 'unavailable';
  const unavailableLabel = 'Unavailable';

  return (
    <section className="rail-card" aria-label="Cost summary">
      <div className="rail-card__header">
        <p className="eyebrow">Spend</p>
        <h2>Cost Summary</h2>
      </div>
      <dl className="cost-grid">
        <dt>Tier</dt>
        <dd>{tier}</dd>
        <dt>Cheap</dt>
        <dd>{tokenTelemetryUnavailable ? unavailableLabel : tokenTotals.cheap}</dd>
        <dt>Reasoning</dt>
        <dd>{tokenTelemetryUnavailable ? unavailableLabel : tokenTotals.premiumReasoning}</dd>
        <dt>Execution</dt>
        <dd>{tokenTelemetryUnavailable ? unavailableLabel : tokenTotals.premiumExecution}</dd>
        <dt>Total</dt>
        <dd title={costTelemetryUnavailable ? 'Cost telemetry has not been reported by this session yet.' : undefined}>
          {costTelemetryUnavailable ? unavailableLabel : `$${costUsd.toFixed(2)}`}
        </dd>
      </dl>
    </section>
  );
}
