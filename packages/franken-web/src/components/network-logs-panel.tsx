import { useMemo, useState } from 'react';

interface NetworkLogsPanelProps {
  logs: string[];
  services: Array<{ id: string; status: string; inProcess?: boolean; hostServiceId?: string }>;
  selectedServiceId?: string;
  isLoading?: boolean;
  error?: string | null;
  onSelectService(serviceId: string): void;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'unknown';

const LOG_LEVELS: Array<LogLevel | 'all'> = ['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'unknown'];

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}(?:T|\s)\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;
const LEVEL_PATTERN = /\b(trace|debug|info|warn|warning|error|fatal)\b/i;

function parseLogLine(line: string) {
  const timestamp = line.match(TIMESTAMP_PATTERN)?.[1];
  const rawLevel = line.match(LEVEL_PATTERN)?.[1]?.toLowerCase();
  const level: LogLevel = rawLevel === 'warning'
    ? 'warn'
    : rawLevel === 'trace' || rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error' || rawLevel === 'fatal'
      ? rawLevel
      : 'unknown';

  return { level, timestamp };
}

function buildDownloadHref(lines: string[]) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`;
}

export function NetworkLogsPanel({
  logs,
  services,
  selectedServiceId,
  isLoading = false,
  error = null,
  onSelectService,
}: NetworkLogsPanelProps) {
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [wrapLines, setWrapLines] = useState(true);
  const [tailLogs, setTailLogs] = useState(true);

  const loggableServices = services.filter((service) => !service.inProcess || service.hostServiceId);
  const parsedLogs = useMemo(() => logs.map((line, index) => ({ ...parseLogLine(line), index, line })), [logs]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleLogs = useMemo(
    () => parsedLogs.filter((log) => {
      const matchesQuery = normalizedQuery.length === 0 || log.line.toLowerCase().includes(normalizedQuery);
      const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
      return matchesQuery && matchesLevel;
    }),
    [levelFilter, normalizedQuery, parsedLogs],
  );
  const visibleText = visibleLogs.map((log) => log.line).join('\n');
  const totalLabel = visibleLogs.length === logs.length
    ? `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}`
    : `${visibleLogs.length} of ${logs.length} entries`;
  const downloadName = `${selectedServiceId || 'network'}-network.log`;

  function copyVisibleLogs() {
    if (!visibleText) {
      return;
    }

    void navigator.clipboard?.writeText(visibleText);
  }

  return (
    <section className="rail-card network-logs">
      <div className="rail-card__header network-logs__header">
        <div>
          <p className="eyebrow">Logs</p>
          <h2>Operational log viewer</h2>
        </div>
        {!isLoading && !error && logs.length > 0 ? <span className="network-logs__count">{totalLabel}</span> : null}
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
        {isLoading ? <p>Loading logs for the selected service...</p> : null}
        {!isLoading && error ? <p role="alert">Could not load logs. Check whether the service is running, then refresh. {error}</p> : null}
        {!isLoading && !error && logs.length > 0 ? (
          <div className="network-logs__viewer">
            <div className="network-logs__toolbar" aria-label="Log viewer controls">
              <label className="field-stack network-logs__search">
                <span>Search</span>
                <input
                  aria-label="Search logs"
                  className="field-control"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter visible logs"
                  type="search"
                  value={query}
                />
              </label>
              <label className="field-stack network-logs__level">
                <span>Level</span>
                <select
                  aria-label="Log level"
                  className="field-control"
                  onChange={(event) => setLevelFilter(event.target.value as LogLevel | 'all')}
                  value={levelFilter}
                >
                  {LOG_LEVELS.map((level) => (
                    <option key={level} value={level}>{level === 'all' ? 'All levels' : level}</option>
                  ))}
                </select>
              </label>
              <button
                aria-pressed={tailLogs}
                className="button button--secondary button--small"
                onClick={() => setTailLogs((value) => !value)}
                type="button"
              >
                {tailLogs ? 'Tail live logs' : 'Paused'}
              </button>
              <label className="network-logs__toggle">
                <input
                  aria-label="Wrap log lines"
                  checked={wrapLines}
                  onChange={(event) => setWrapLines(event.target.checked)}
                  type="checkbox"
                />
                <span>Wrap</span>
              </label>
              <button
                className="button button--secondary button--small"
                disabled={visibleLogs.length === 0}
                onClick={copyVisibleLogs}
                type="button"
              >
                Copy visible logs
              </button>
              <a
                className="button button--secondary button--small"
                download={downloadName}
                href={buildDownloadHref(visibleLogs.map((log) => log.line))}
              >
                Download visible logs
              </a>
            </div>
            {visibleLogs.length > 0 ? (
              <ol className={`network-logs__lines${wrapLines ? ' network-logs__lines--wrap' : ''}${tailLogs ? ' network-logs__lines--tail' : ''}`} aria-label="Visible network logs">
                {visibleLogs.map((log) => (
                  <li className={`network-logs__line network-logs__line--${log.level}`} key={`${log.index}:${log.line}`}>
                    <span className="network-logs__line-number">{log.index + 1}</span>
                    <span className="network-logs__badge">{log.level}</span>
                    {log.timestamp ? <time dateTime={log.timestamp}>{log.timestamp}</time> : null}
                    <code>{log.line}</code>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No logs match the current search and level filters.</p>
            )}
          </div>
        ) : null}
        {!isLoading && !error && logs.length === 0 ? (
          <p>{selectedServiceId ? 'No logs are available yet. Refresh after the service emits output, or pick another service.' : 'Select a service to inspect its operational logs.'}</p>
        ) : null}
      </div>
    </section>
  );
}
