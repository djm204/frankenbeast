export interface CostBadgeProps {
  tier: string;
  telemetryStatus: 'available' | 'unavailable';
  tokenTotals: {
    cheap: number;
    premiumReasoning: number;
    premiumExecution: number;
  };
  costUsd: number;
}

export function CostBadge({ tier, telemetryStatus, tokenTotals, costUsd }: CostBadgeProps) {
  const telemetryUnavailable = telemetryStatus === 'unavailable';
  const unavailableLabel = 'Unavailable';

  return (
    <section className="rail-card" aria-label="Cost summary">
      <div className="rail-card__header">
        <p className="eyebrow">Spend</p>
        <h2>Cost Summary</h2>
      </div>
      <dl className="cost-grid">
        <dt>Tier</dt>
        <dd>{telemetryUnavailable ? unavailableLabel : tier}</dd>
        <dt>Cheap</dt>
        <dd>{telemetryUnavailable ? unavailableLabel : tokenTotals.cheap}</dd>
        <dt>Reasoning</dt>
        <dd>{telemetryUnavailable ? unavailableLabel : tokenTotals.premiumReasoning}</dd>
        <dt>Execution</dt>
        <dd>{telemetryUnavailable ? unavailableLabel : tokenTotals.premiumExecution}</dd>
        <dt>Total</dt>
        <dd title={telemetryUnavailable ? 'Cost telemetry has not been reported by this session yet.' : undefined}>
          {telemetryUnavailable ? unavailableLabel : `$${costUsd.toFixed(2)}`}
        </dd>
      </dl>
    </section>
  );
}
