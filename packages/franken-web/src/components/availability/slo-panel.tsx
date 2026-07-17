import type { DashboardSlo, DashboardSloMetric, DashboardSloMetricStatus, DashboardSloMetricUnit } from '../../lib/dashboard-api';

interface SloPanelProps {
  slo?: DashboardSlo | null | undefined;
}

const STATUS_BADGES: Record<DashboardSloMetricStatus, string> = {
  ok: '[ok]',
  warning: '[warning]',
  breach: '[breach]',
  unknown: '[unknown]',
};

function formatValue(metric: DashboardSloMetric): string {
  if (metric.value === null) return 'No data';
  if (metric.unit === 'percent') return `${metric.value.toFixed(metric.value % 1 === 0 ? 0 : 1)}%`;
  if (metric.unit === 'milliseconds') return formatDuration(metric.value);
  return String(metric.value);
}

function formatTarget(unit: DashboardSloMetricUnit, target: number): string {
  if (unit === 'percent') return `${target}%`;
  if (unit === 'milliseconds') return formatDuration(target);
  return String(target);
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${round(hours)}h`;
  return `${round(hours / 24)}d`;
}

function round(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

export function SloPanel({ slo }: SloPanelProps) {
  const window = slo?.windows[0];

  return (
    <section className="slo-panel rail-card" aria-label="SLO dashboard">
      <h3>SLO dashboard</h3>
      {!slo || !window ? (
        <p>No SLO metrics reported yet.</p>
      ) : (
        <>
          <p>
            Window: <strong>{window.label}</strong> · Sample size: <strong>{window.sampleSize}</strong>
          </p>
          <ul className="slo-panel__metrics">
            {window.metrics.map((metric) => (
              <li key={metric.id} className="slo-panel__metric">
                <span className="slo-panel__status">{STATUS_BADGES[metric.status]}</span>
                {' '}
                <strong>{metric.label}</strong>
                {': '}
                <span>{formatValue(metric)}</span>
                {' '}
                <small>
                  target {metric.comparator} {formatTarget(metric.unit, metric.target)}
                </small>
              </li>
            ))}
          </ul>
          {window.failureCategories.length > 0 ? (
            <p>
              <strong>Failure categories:</strong>
              {' '}
              {window.failureCategories.map((category) => `${category.category} (${category.count})`).join(', ')}
            </p>
          ) : (
            <p>No failure categories in this window.</p>
          )}
          <p>
            Source:{' '}
            {slo.source.kanban ? 'Kanban' : 'no Kanban'} / {slo.source.runs ? 'runs' : 'no runs'} / {slo.source.approvals ? 'approval blocks' : 'no approval blocks'}.
          </p>
        </>
      )}
    </section>
  );
}
