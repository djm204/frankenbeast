interface NetworkStatusGridProps {
  mode?: string;
  secureBackend?: string;
}

export function NetworkStatusGrid({ mode, secureBackend }: NetworkStatusGridProps) {
  return (
    <section className="rail-card network-status-grid">
      <div>
        <p className="eyebrow">Security mode</p>
        <strong>{mode ?? 'unknown'}</strong>
      </div>
      <div>
        <p className="eyebrow">Backend</p>
        <strong>{secureBackend ?? 'n/a'}</strong>
      </div>
    </section>
  );
}
