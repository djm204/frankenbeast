export interface CostBadgeProps {
  tier: string;
  tokenTotals: {
    cheap: number;
    premiumReasoning: number;
    premiumExecution: number;
  };
  costUsd: number;
}

export function CostBadge({ tier, tokenTotals, costUsd }: CostBadgeProps) {
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
        <dd>{tokenTotals.cheap}</dd>
        <dt>Reasoning</dt>
        <dd>{tokenTotals.premiumReasoning}</dd>
        <dt>Execution</dt>
        <dd>{tokenTotals.premiumExecution}</dd>
        <dt>Total</dt>
        <dd>${costUsd.toFixed(2)}</dd>
      </dl>
    </section>
  );
}
