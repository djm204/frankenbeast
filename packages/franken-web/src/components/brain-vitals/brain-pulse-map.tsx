import { useEffect, useMemo, useState } from 'react';
import type {
  BrainVitalsActivity,
  BrainVitalsDimension,
  BrainVitalsSnapshot,
} from '../../lib/brain-vitals-api';

const ACTIVITY_WINDOW_MS = 60_000;
const DIMENSIONS: readonly BrainVitalsDimension[] = ['cache', 'compaction', 'churn', 'resource', 'cost'];
const FACULTIES = ['memory', 'planning', 'reasoning', 'action', 'learning'] as const;

const LABELS: Record<BrainVitalsDimension, string> = {
  cache: 'Cache',
  compaction: 'Compaction',
  churn: 'Churn',
  resource: 'Resource',
  cost: 'Cost',
};

type HealthState = 'healthy' | 'warning' | 'danger' | 'unavailable';
type PulseState = 'idle' | 'low' | 'medium' | 'high';

export interface BrainPulseActivity extends BrainVitalsActivity {
  readonly receivedAt: number;
  readonly sequence: number;
}

interface BrainPulseMapProps {
  snapshot: BrainVitalsSnapshot;
  activities: readonly BrainPulseActivity[];
  onOpenRun: (runId: string) => void;
}

function healthValue(snapshot: BrainVitalsSnapshot, dimension: BrainVitalsDimension): number | null {
  switch (dimension) {
    case 'cache': return snapshot.health.signals.cacheHitRatio;
    case 'compaction': return 1 - snapshot.health.signals.compactionPressure;
    case 'churn': return 1 - snapshot.health.signals.churnRatio;
    case 'resource': return snapshot.resource.availability === 'available'
      ? 1 - snapshot.health.signals.resourcePressure
      : null;
    case 'cost': return 1 - snapshot.health.signals.budgetBurnRatio;
  }
}

function healthState(value: number | null): HealthState {
  if (value === null) return 'unavailable';
  if (value >= 0.75) return 'healthy';
  if (value >= 0.45) return 'warning';
  return 'danger';
}

function pulseState(count: number): PulseState {
  if (count === 0) return 'idle';
  if (count <= 2) return 'low';
  if (count <= 5) return 'medium';
  return 'high';
}

function aggregateHealthState(score: number): Exclude<HealthState, 'unavailable'> {
  if (score >= 75) return 'healthy';
  if (score >= 45) return 'warning';
  return 'danger';
}

export function BrainPulseMap({ snapshot, activities, onOpenRun }: BrainPulseMapProps) {
  const [now, setNow] = useState(() => Date.now());
  const [selectedDimension, setSelectedDimension] = useState<BrainVitalsDimension | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setNow(Date.now());
  }, [activities]);

  const recentActivities = useMemo(() => activities.filter((activity) => (
    activity.receivedAt >= now - ACTIVITY_WINDOW_MS
    && activity.receivedAt <= now + 5_000
  )), [activities, now]);

  const selectedActivities = selectedDimension
    ? recentActivities.filter((activity) => activity.dimension === selectedDimension)
    : [];

  return (
    <section className="brain-pulse-map" role="region" aria-label="Brain pulse map">
      <header>
        <div>
          <h4>Live Brain Pulse Map</h4>
          <p>Pulse rate reflects real activity events observed in the last minute.</p>
        </div>
        <small>{recentActivities.length} recent {recentActivities.length === 1 ? 'event' : 'events'}</small>
      </header>

      {/* A fixed grid keeps all dimensions legible and keyboard reachable at narrow dashboard widths. */}
      <div className="brain-pulse-map__grid">
        <div
          className={`brain-pulse-map__core brain-pulse-map--${aggregateHealthState(snapshot.health.score)}`}
          aria-label={`Overall brain health ${Math.round(snapshot.health.score)}`}
        >
          <span>Overall</span>
          <strong>{Math.round(snapshot.health.score)}</strong>
        </div>
        {DIMENSIONS.map((dimension) => {
          const count = recentActivities.filter((activity) => activity.dimension === dimension).length;
          const value = healthValue(snapshot, dimension);
          const state = healthState(value);
          const activityState = pulseState(count);
          return (
            <button
              key={dimension}
              type="button"
              className={`brain-pulse-map__node brain-pulse-map__node--${dimension} brain-pulse-map--${state} brain-pulse-map__node--${activityState}`}
              aria-label={`${LABELS[dimension]} activity: ${state}, ${count} ${count === 1 ? 'event' : 'events'} in the last minute`}
              aria-pressed={selectedDimension === dimension}
              data-activity-count={count}
              data-pulse-state={activityState === 'idle' ? 'idle' : 'active'}
              onClick={() => setSelectedDimension(dimension)}
            >
              <span>{LABELS[dimension]}</span>
              <strong>{count}/min</strong>
              <small>{value === null ? 'Telemetry unavailable' : `Health signal ${Math.round(value * 100)}%`}</small>
            </button>
          );
        })}
      </div>

      <div className="brain-pulse-map__faculties" aria-label="Faculty pulse map availability">
        {FACULTIES.map((faculty) => (
          <span key={faculty}><strong>{faculty}</strong><small>Coming soon — no live faculty event feed</small></span>
        ))}
      </div>

      {selectedDimension && (
        <section
          className="brain-pulse-map__detail"
          role="region"
          aria-label={`${LABELS[selectedDimension]} pulse detail`}
        >
          <div>
            <h5>{LABELS[selectedDimension]} activity</h5>
            <button type="button" onClick={() => setSelectedDimension(null)}>Close detail</button>
          </div>
          {selectedActivities.length === 0 ? (
            <p>No real {LABELS[selectedDimension]!.toLowerCase()} activity events were observed in the last minute.</p>
          ) : (
            <ol>
              {[...selectedActivities].sort((left, right) => right.receivedAt - left.receivedAt).map((activity) => (
                <li key={activity.sequence}>
                  <span><strong>{activity.kind}</strong><small>{new Date(activity.timestamp).toLocaleTimeString()}</small></span>
                  <button
                    type="button"
                    aria-label={`Open run ${activity.runId} from ${activity.dimension} activity`}
                    onClick={() => onOpenRun(activity.runId)}
                  >
                    {activity.runId}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}
