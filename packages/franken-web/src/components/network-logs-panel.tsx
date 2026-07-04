interface NetworkLogsPanelProps {
  logs: string[];
  services: Array<{ id: string; status: string; inProcess?: boolean; hostServiceId?: string }>;
  selectedServiceId?: string;
  isLoading?: boolean;
  error?: string | null;
  onSelectService(serviceId: string): void;
}

export function NetworkLogsPanel({
  logs,
  services,
  selectedServiceId,
  isLoading = false,
  error = null,
  onSelectService,
}: NetworkLogsPanelProps) {
  const loggableServices = services.filter((service) => !service.inProcess || service.hostServiceId);

  return (
    <section className="rail-card network-logs">
      <div className="rail-card__header">
        <p className="eyebrow">Logs</p>
      </div>
      <label className="field-stack">
        <span>Service logs</span>
        <select
          aria-label="Service logs"
          className="field-control"
          onChange={(event) => onSelectService(event.target.value)}
          value={selectedServiceId ?? ''}
        >
          <option value="">Select a service</option>
          {loggableServices.map((service) => (
            <option key={service.id} value={service.id}>
              {service.id} ({service.status})
            </option>
          ))}
        </select>
      </label>
      <div className="network-logs__list">
        {isLoading ? <p>Loading logs...</p> : null}
        {!isLoading && error ? <p role="alert">{error}</p> : null}
        {!isLoading && !error && logs.length > 0 ? logs.map((log, index) => <code key={`${index}:${log}`}>{log}</code>) : null}
        {!isLoading && !error && logs.length === 0 ? <p>{selectedServiceId ? 'No logs found.' : 'No logs selected.'}</p> : null}
      </div>
    </section>
  );
}
