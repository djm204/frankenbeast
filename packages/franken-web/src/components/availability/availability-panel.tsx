import type { DashboardAvailability, DashboardDependency, DashboardDependencyStatus } from '../../lib/dashboard-api';

interface AvailabilityPanelProps {
  availability?: DashboardAvailability | undefined;
}

const STATUS_LABELS: Record<DashboardDependencyStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
};

const STATUS_BADGES: Record<DashboardDependencyStatus, string> = {
  healthy: '[ok]',
  degraded: '[degraded]',
  unavailable: '[unavailable]',
  unknown: '[unknown]',
};

function priority(status: DashboardDependencyStatus): number {
  if (status === 'unavailable') return 0;
  if (status === 'degraded') return 1;
  if (status === 'unknown') return 2;
  return 3;
}

function visibleDependencies(availability?: DashboardAvailability): DashboardDependency[] {
  return [...(availability?.dependencies ?? [])].sort((a, b) => {
    const priorityDelta = priority(a.status) - priority(b.status);
    if (priorityDelta !== 0) return priorityDelta;
    return a.name.localeCompare(b.name);
  });
}

export function AvailabilityPanel({ availability }: AvailabilityPanelProps) {
  const dependencies = visibleDependencies(availability);

  return (
    <section className="availability-panel rail-card" aria-label="Dependency availability">
      <h3>Dependency availability</h3>
      <p>
        Overall status:{' '}
        <strong>{STATUS_LABELS[availability?.status ?? 'unknown']}</strong>
      </p>
      {dependencies.length === 0 ? (
        <p>No dependency status reported.</p>
      ) : (
        <ul className="availability-panel__list">
          {dependencies.map((dependency) => (
            <li key={`${dependency.type}:${dependency.name}`} className="availability-panel__item">
              <div>
                <span className="availability-panel__status">{STATUS_BADGES[dependency.status]}</span>
                {' '}
                <strong>{dependency.name}</strong>
                {' '}
                <span className="availability-panel__type">{dependency.type}</span>
              </div>
              <p>{dependency.summary}</p>
              <p>
                <strong>Remediation:</strong>
                {' '}
                {dependency.remediationHint}
              </p>
              {dependency.safeWork.length > 0 && (
                <p>
                  <strong>Safe work:</strong>
                  {' '}
                  {dependency.safeWork.join(' ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
