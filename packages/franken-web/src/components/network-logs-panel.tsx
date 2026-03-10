interface NetworkLogsPanelProps {
  logs: string[];
}

export function NetworkLogsPanel({ logs }: NetworkLogsPanelProps) {
  return (
    <section className="rail-card network-logs">
      <div className="rail-card__header">
        <p className="eyebrow">Logs</p>
      </div>
      <div className="network-logs__list">
        {logs.length > 0 ? logs.map((log) => <code key={log}>{log}</code>) : <p>No logs selected.</p>}
      </div>
    </section>
  );
}
