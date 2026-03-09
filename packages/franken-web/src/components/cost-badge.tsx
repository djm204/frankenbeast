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
    <section aria-label="Cost summary">
      <h2>Cost</h2>
      <dl>
        <dt>Tier</dt>
        <dd>{tier}</dd>
        <dt>Cheap tokens</dt>
        <dd>{tokenTotals.cheap}</dd>
        <dt>Premium reasoning</dt>
        <dd>{tokenTotals.premiumReasoning}</dd>
        <dt>Premium execution</dt>
        <dd>{tokenTotals.premiumExecution}</dd>
        <dt>Total cost</dt>
        <dd>${costUsd.toFixed(2)}</dd>
      </dl>
    </section>
  );
}
