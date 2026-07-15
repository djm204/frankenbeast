interface ProviderPanelProps {
  providers: Array<{ name: string; type: string; available: boolean; failoverOrder: number }>;
}

function summarizeUnavailableProviders(providers: ProviderPanelProps['providers']): string {
  const unavailableProviders = providers
    .filter((provider) => !provider.available)
    .sort((a, b) => a.failoverOrder - b.failoverOrder);

  if (unavailableProviders.length === 0) return '';

  return unavailableProviders
    .map((provider) => `${provider.name} (${provider.type}, failover #${provider.failoverOrder + 1})`)
    .join(', ');
}

export function ProviderPanel({ providers }: ProviderPanelProps) {
  const outageSummary = summarizeUnavailableProviders(providers);

  return (
    <div className="provider-panel rail-card">
      <h3>Providers</h3>
      {outageSummary && (
        <div className="provider-panel__incident-banner" role="alert" aria-live="polite">
          <strong>Provider outage incident:</strong>
          {' '}
          {outageSummary}
          {' '}
          unavailable. Use the next available failover provider and check provider credentials or upstream status before launching new work.
        </div>
      )}
      {providers.length === 0 && <p>No providers configured.</p>}
      <ul className="provider-panel__list">
        {[...providers]
          .sort((a, b) => a.failoverOrder - b.failoverOrder)
          .map((p) => (
            <li key={p.name} className="provider-panel__item">
              <span className="provider-panel__status">{p.available ? '[ok]' : '[unavailable]'}</span>
              <span className="provider-panel__name">{p.name}</span>
              <span className="provider-panel__type">{p.type}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
