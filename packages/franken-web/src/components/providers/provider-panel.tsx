interface ProviderPanelProps {
  providers: Array<{ name: string; type: string }>;
}

export function ProviderPanel({ providers }: ProviderPanelProps) {
  return (
    <div className="provider-panel rail-card">
      <h3>Providers</h3>
      {providers.length === 0 && <p>No providers configured.</p>}
      <ul className="provider-panel__list">
        {providers.map((p) => (
          <li key={p.name} className="provider-panel__item">
            <span className="provider-panel__name">{p.name}</span>
            <span className="provider-panel__type">{p.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
