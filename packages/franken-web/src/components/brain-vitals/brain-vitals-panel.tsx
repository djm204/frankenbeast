import { useEffect, useMemo, useRef, useState } from 'react';
import type { BeastRunSummary } from '@franken/types';
import type {
  BrainHealthSample,
  BrainVitalsDimension,
  BrainVitalsRunDetail,
  BrainVitalsSnapshot,
  DashboardApiClient,
} from '../../lib/dashboard-api';
import { SlideInPanel } from '../beasts/slide-in-panel';
import {
  BrainPulseMap,
  type BrainPulseActivity,
  type BrainPulseActivityReceipts,
} from './brain-pulse-map';

interface BrainVitalsPanelProps {
  client: DashboardApiClient;
}

interface ResourcePoint {
  timestamp: number;
  cpuPercent: number;
  rssMb: number;
  estimatedWatts: number;
}

interface AggregatePoint {
  timestamp: number;
  totalTokens: number;
  estimatedUsd: number;
}

const PULSE_DIMENSIONS: readonly BrainVitalsDimension[] = ['cache', 'compaction', 'churn', 'resource', 'cost'];
const MAX_ACTIVITY_DETAILS_PER_DIMENSION = 200;

function emptyActivityReceipts(): BrainPulseActivityReceipts {
  return { cache: [], compaction: [], churn: [], resource: [], cost: [] };
}

export function pruneActivityReceipts(
  current: BrainPulseActivityReceipts,
  cutoff: number,
): BrainPulseActivityReceipts {
  const next: BrainPulseActivityReceipts = {
    cache: current.cache.filter((receivedAt: number) => receivedAt >= cutoff),
    compaction: current.compaction.filter((receivedAt: number) => receivedAt >= cutoff),
    churn: current.churn.filter((receivedAt: number) => receivedAt >= cutoff),
    resource: current.resource.filter((receivedAt: number) => receivedAt >= cutoff),
    cost: current.cost.filter((receivedAt: number) => receivedAt >= cutoff),
  };
  const changed = PULSE_DIMENSIONS.some((dimension) => (
    next[dimension].length !== current[dimension].length
  ));
  return changed ? next : current;
}

function appendActivityDetail(
  current: BrainPulseActivity[],
  activity: BrainPulseActivity,
): BrainPulseActivity[] {
  const recent = current.filter((candidate) => candidate.receivedAt >= activity.receivedAt - 60_000);
  const dimensionCount = recent.filter((candidate) => candidate.dimension === activity.dimension).length;
  let toDrop = Math.max(0, dimensionCount + 1 - MAX_ACTIVITY_DETAILS_PER_DIMENSION);
  const retained = recent.filter((candidate) => {
    if (candidate.dimension !== activity.dimension || toDrop === 0) return true;
    toDrop -= 1;
    return false;
  });
  return [...retained, activity];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function appendResourcePoint(points: ResourcePoint[], snapshot: BrainVitalsSnapshot): ResourcePoint[] {
  const resource = snapshot.resource.latest;
  if (snapshot.resource.availability !== 'available' || !resource) return points;
  const point = {
    timestamp: resource.timestamp,
    cpuPercent: resource.cpuPercent,
    rssMb: resource.rssBytes / 1024 / 1024,
    estimatedWatts: resource.estimatedWatts,
  };
  const withoutDuplicate = points.filter((candidate) => candidate.timestamp !== resource.timestamp);
  return [...withoutDuplicate, point].sort((left, right) => left.timestamp - right.timestamp).slice(-60);
}

function appendAggregatePoint(points: AggregatePoint[], snapshot: BrainVitalsSnapshot): AggregatePoint[] {
  const point = {
    timestamp: snapshot.window.before,
    totalTokens: snapshot.cache.promptTokens + snapshot.cache.cacheReadTokens + snapshot.cache.cacheCreationTokens,
    estimatedUsd: snapshot.cost.estimatedUsd,
  };
  const withoutDuplicate = points.filter((candidate) => candidate.timestamp !== point.timestamp);
  return [...withoutDuplicate, point].sort((left, right) => left.timestamp - right.timestamp).slice(-60);
}

function mergeHealthSamples(current: BrainHealthSample[], incoming: BrainHealthSample[]): BrainHealthSample[] {
  const samples = new Map(current.map((sample) => [sample.timestamp, sample]));
  for (const sample of incoming) samples.set(sample.timestamp, sample);
  return [...samples.values()].sort((left, right) => left.timestamp - right.timestamp).slice(-120);
}

function mergeRunPage(cache: Map<string, BeastRunSummary>, incoming: BeastRunSummary[]): BeastRunSummary[] {
  for (const run of incoming) cache.set(run.id, run);
  const newestRuns = [...cache.values()]
    .sort((left, right) => (
      Date.parse(right.createdAt) - Date.parse(left.createdAt)
      || right.id.localeCompare(left.id)
    ))
    .slice(0, 500);
  cache.clear();
  for (const run of newestRuns) cache.set(run.id, run);
  return newestRuns;
}

function chartPoints(values: readonly number[]): string {
  if (values.length === 0) return '';
  const maximum = Math.max(...values, 1);
  return values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 38 - (value / maximum) * 34;
    return `${x},${y}`;
  }).join(' ');
}

function TrendChart({
  label,
  values,
  pointCount,
}: {
  label: string;
  values: readonly number[];
  pointCount: number;
}) {
  return (
    <svg
      className="brain-vitals-panel__chart"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-point-count={pointCount}
    >
      <polyline points={chartPoints(values)} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BrainVitalsPanel({ client }: BrainVitalsPanelProps) {
  const generationRef = useRef(0);
  const runRequestRef = useRef(0);
  const activitySequenceRef = useRef(0);
  const runCacheRef = useRef(new Map<string, BeastRunSummary>());
  const nextRunCursorRef = useRef<string | undefined>(undefined);
  const runDiscoveryInFlightRef = useRef(false);
  const runDiscoveryRequestRef = useRef(0);
  const lastRunDiscoveryAtRef = useRef(0);
  const latestSnapshotTimestampRef = useRef(0);
  const [runs, setRuns] = useState<BeastRunSummary[]>([]);
  const [brainIds, setBrainIds] = useState<string[]>([]);
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrainVitalsSnapshot | null>(null);
  const [history, setHistory] = useState<BrainHealthSample[]>([]);
  const [resourcePoints, setResourcePoints] = useState<ResourcePoint[]>([]);
  const [aggregatePoints, setAggregatePoints] = useState<AggregatePoint[]>([]);
  const [activities, setActivities] = useState<BrainPulseActivity[]>([]);
  const [activityReceipts, setActivityReceipts] = useState(emptyActivityReceipts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<BrainVitalsRunDetail | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 60_000;
      setActivityReceipts((current: BrainPulseActivityReceipts) => pruneActivityReceipts(current, cutoff));
      setActivities((current) => {
        const recent = current.filter((activity) => activity.receivedAt >= cutoff);
        return recent.length === current.length ? current : recent;
      });
    }, 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let active = true;
    setLoading(true);
    setError(null);
    setHistoryError(null);
    setRuns([]);
    setBrainIds([]);
    setSelectedBrainId(null);
    setSnapshot(null);
    setHistory([]);
    setResourcePoints([]);
    setAggregatePoints([]);
    setActivities([]);
    setActivityReceipts(emptyActivityReceipts());
    runCacheRef.current.clear();
    nextRunCursorRef.current = undefined;

    const refreshRuns = async (initial: boolean) => {
      if (runDiscoveryInFlightRef.current) return;
      runDiscoveryInFlightRef.current = true;
      const discoveryRequest = runDiscoveryRequestRef.current + 1;
      runDiscoveryRequestRef.current = discoveryRequest;
      try {
        const newestPage = await client.listBrainVitalsRuns(100, undefined);
        let nextRuns = newestPage.runs;
        let backfillError: unknown;
        if (initial) nextRunCursorRef.current = newestPage.nextCursor;
        else {
          if (!nextRunCursorRef.current) nextRunCursorRef.current = newestPage.nextCursor;
          if (nextRunCursorRef.current) {
            try {
              const backfillPage = await client.listBrainVitalsRuns(100, nextRunCursorRef.current);
              nextRunCursorRef.current = backfillPage.nextCursor;
              nextRuns = [...nextRuns, ...backfillPage.runs];
            } catch (loadError) {
              backfillError = loadError;
            }
          }
        }
        if (!active || generationRef.current !== generation) return;
        const discoveredRuns = mergeRunPage(runCacheRef.current, nextRuns);
        const nextBrainIds = [...new Set(discoveredRuns.map((run) => run.definitionId))].sort();
        setRuns(discoveredRuns);
        setBrainIds(nextBrainIds);
        setSelectedBrainId((current) => current && nextBrainIds.includes(current) ? current : nextBrainIds[0] ?? null);
        if (nextBrainIds.length === 0) setLoading(false);
        setDiscoveryError(backfillError
          ? `Unable to backfill older Brain Vitals runs. ${describeError(backfillError)}`
          : null);
        lastRunDiscoveryAtRef.current = Date.now();
      } catch (loadError) {
        if (!active || generationRef.current !== generation) return;
        const message = `Unable to discover Brain Vitals runs. ${describeError(loadError)}`;
        setDiscoveryError(message);
        if (initial) setLoading(false);
      } finally {
        if (runDiscoveryRequestRef.current === discoveryRequest) {
          runDiscoveryInFlightRef.current = false;
        }
      }
    };

    void refreshRuns(true);
    const discoveryTimer = setInterval(() => void refreshRuns(false), 10_000);

    return () => {
      active = false;
      clearInterval(discoveryTimer);
      generationRef.current += 1;
    };
  }, [client]);

  useEffect(() => {
    if (!selectedBrainId) return;
    const generation = generationRef.current;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    setError(null);
    setHistoryError(null);
    setStreamError(null);
    setSnapshot(null);
    setHistory([]);
    setResourcePoints([]);
    setAggregatePoints([]);
    setActivities([]);
    setActivityReceipts(emptyActivityReceipts());
    latestSnapshotTimestampRef.current = 0;
    setSelectedRunId(null);
    setRunDetail(null);

    const applySnapshot = (nextSnapshot: BrainVitalsSnapshot, replaceAtSameTimestamp = true) => {
      if (
        nextSnapshot.window.before < latestSnapshotTimestampRef.current
        || (
          !replaceAtSameTimestamp
          && latestSnapshotTimestampRef.current !== 0
          && nextSnapshot.window.before === latestSnapshotTimestampRef.current
        )
      ) return;
      latestSnapshotTimestampRef.current = nextSnapshot.window.before;
      setSnapshot(nextSnapshot);
      setHistory((samples) => mergeHealthSamples(samples, [nextSnapshot.health]));
      setResourcePoints((points) => appendResourcePoint(points, nextSnapshot));
      setAggregatePoints((points) => appendAggregatePoint(points, nextSnapshot));
    };

    void Promise.allSettled([
      client.fetchBrainVitalsSnapshot(selectedBrainId),
      client.fetchBrainVitalsHistory(selectedBrainId, '1h'),
    ]).then(([snapshotResult, historyResult]) => {
      if (!active || generationRef.current !== generation) return;
      if (historyResult.status === 'fulfilled') {
        setHistory((samples) => mergeHealthSamples(samples, historyResult.value.data));
        setHistoryError(null);
      } else {
        setHistoryError(`Unable to load Brain Vitals history for ${selectedBrainId}. ${describeError(historyResult.reason)}`);
      }
      if (snapshotResult.status === 'fulfilled') {
        applySnapshot(snapshotResult.value, false);
        setError(null);
      } else if (latestSnapshotTimestampRef.current === 0) {
        setError(`Unable to load Brain Vitals for ${selectedBrainId}. ${describeError(snapshotResult.reason)}`);
      }
      setLoading(false);
    });

    client.subscribeToBrainVitals(
      selectedBrainId,
      (nextSnapshot) => {
        if (!active || generationRef.current !== generation) return;
        applySnapshot(nextSnapshot);
        setError(null);
        setLoading(false);
        setStreamError(null);
      },
      (subscriptionError) => {
        if (!active || generationRef.current !== generation) return;
        setStreamError(describeError(subscriptionError));
      },
      (activity) => {
        if (!active || generationRef.current !== generation) return;
        const receivedAt = Date.now();
        setActivityReceipts((current: BrainPulseActivityReceipts) => {
          const recent = pruneActivityReceipts(current, receivedAt - 60_000);
          return {
            ...recent,
            [activity.dimension]: [...recent[activity.dimension], receivedAt],
          };
        });
        setActivities((current) => {
          activitySequenceRef.current += 1;
          return appendActivityDetail(current, {
            ...activity,
            receivedAt,
            sequence: activitySequenceRef.current,
          });
        });
        if (
          activity.dimension !== 'churn'
          || runDiscoveryInFlightRef.current
          || Date.now() - lastRunDiscoveryAtRef.current < 10_000
        ) return;
        runDiscoveryInFlightRef.current = true;
        const discoveryRequest = runDiscoveryRequestRef.current + 1;
        runDiscoveryRequestRef.current = discoveryRequest;
        void client.listBrainVitalsRuns(100, undefined).then(({ runs: nextRuns }) => {
          if (!active || generationRef.current !== generation) return;
          const discoveredRuns = mergeRunPage(runCacheRef.current, nextRuns);
          setRuns(discoveredRuns);
          setBrainIds([...new Set(discoveredRuns.map((run) => run.definitionId))].sort());
          setDiscoveryError(null);
          lastRunDiscoveryAtRef.current = Date.now();
        }).catch((runListError: unknown) => {
          if (!active || generationRef.current !== generation) return;
          setDiscoveryError(`Live run refresh failed. ${describeError(runListError)}`);
        }).finally(() => {
          if (runDiscoveryRequestRef.current === discoveryRequest) {
            runDiscoveryInFlightRef.current = false;
          }
        });
      },
    ).then((stop) => {
      if (!active || generationRef.current !== generation) {
        stop();
        return;
      }
      unsubscribe = stop;
    }).catch((subscriptionError) => {
      if (!active || generationRef.current !== generation) return;
      setStreamError(describeError(subscriptionError));
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client, selectedBrainId]);

  const selectedRuns = useMemo(
    () => runs.filter((run) => run.definitionId === selectedBrainId),
    [runs, selectedBrainId],
  );

  async function openRun(runId: string): Promise<void> {
    if (!selectedBrainId) return;
    const request = runRequestRef.current + 1;
    runRequestRef.current = request;
    setSelectedRunId(runId);
    setRunDetail(null);
    setRunError(null);
    setRunLoading(true);
    try {
      const detail = await client.fetchBrainVitalsRun(selectedBrainId, runId);
      if (runRequestRef.current !== request) return;
      setRunDetail(detail);
    } catch (detailError) {
      if (runRequestRef.current === request) {
        setRunError(`Unable to load run ${runId}. ${describeError(detailError)}`);
      }
    } finally {
      if (runRequestRef.current === request) setRunLoading(false);
    }
  }

  const latestResourcePoint = resourcePoints.at(-1);
  const latestAggregatePoint = aggregatePoints.at(-1);
  const regionLabel = selectedBrainId ? `Brain Vitals for ${selectedBrainId}` : 'Brain Vitals';

  return (
    <section className="brain-vitals-panel rail-card" role="region" aria-label={regionLabel}>
      <div className="brain-vitals-panel__heading">
        <div>
          <h3>Brain Vitals</h3>
          <p>Operational health and live run telemetry</p>
        </div>
        {brainIds.length > 0 && (
          <label>
            Brain
            <select
              className="field-control"
              value={selectedBrainId ?? ''}
              onChange={(event) => setSelectedBrainId(event.target.value)}
            >
              {brainIds.map((brainId) => <option key={brainId}>{brainId}</option>)}
            </select>
          </label>
        )}
      </div>

      {loading && <p role="status">Loading Brain Vitals...</p>}
      {!loading && brainIds.length === 0 && !error && !discoveryError && (
        <p className="rail-card__empty">No Beast runs exist yet, so there are no Brain Vitals to display.</p>
      )}
      {error && <p className="brain-vitals-panel__alert" role="alert">{error}</p>}
      {historyError && <p className="brain-vitals-panel__alert" role="alert">{historyError}</p>}
      {discoveryError && <p className="brain-vitals-panel__alert" role="alert">{discoveryError}</p>}
      {streamError && <p className="brain-vitals-panel__alert" role="alert">Live updates interrupted. {streamError}</p>}

      {snapshot && (
        <>
          <BrainPulseMap
            snapshot={snapshot}
            activities={activities}
            activityReceipts={activityReceipts}
            onOpenRun={(runId) => void openRun(runId)}
          />

          <div className="brain-vitals-panel__metrics">
            <article className="brain-vitals-panel__score" aria-label={`Health score ${snapshot.health.score}`}>
              <span>Health score</span>
              <strong>{Math.round(snapshot.health.score)}</strong>
              <meter min="0" max="100" value={snapshot.health.score}>{snapshot.health.score}</meter>
            </article>
            <article><span>Cache hit</span><strong>{Math.round(snapshot.cache.hitRatio * 100)}%</strong></article>
            <article><span>Compactions</span><strong>{snapshot.compaction.count}</strong></article>
            <article><span>Cost</span><strong>${snapshot.cost.estimatedUsd.toFixed(4)}</strong></article>
            <article><span>Energy</span><strong>{snapshot.resource.availability === 'available' ? `${snapshot.resource.estimatedEnergyWh.toFixed(3)} Wh` : 'Unavailable'}</strong></article>
            <article><span>Churn</span><strong>{snapshot.churn.failed + snapshot.churn.stopped}/{snapshot.churn.spawnCount}</strong></article>
          </div>

          <div className="brain-vitals-panel__trends">
            <article>
              <h4>Health trend</h4>
              <TrendChart label="Health score trend" values={history.map((sample) => sample.score)} pointCount={history.length} />
              <small>{history.length} persisted/live samples</small>
            </article>
            <article>
              <h4>Resource usage</h4>
              <TrendChart label="Resource usage trend" values={resourcePoints.map((point) => point.cpuPercent)} pointCount={resourcePoints.length} />
              <TrendChart label="Memory usage trend" values={resourcePoints.map((point) => point.rssMb)} pointCount={resourcePoints.length} />
              <TrendChart label="Power usage trend" values={resourcePoints.map((point) => point.estimatedWatts)} pointCount={resourcePoints.length} />
              <small>{snapshot.resource.availability === 'available' && latestResourcePoint ? `${Math.round(latestResourcePoint.cpuPercent)}% CPU · ${Math.round(latestResourcePoint.rssMb)} MB RSS` : 'Resource telemetry unavailable'}</small>
            </article>
            <article>
              <h4>Input/cache token and cost trends</h4>
              <TrendChart label="Input and cache token trend" values={aggregatePoints.map((point) => point.totalTokens)} pointCount={aggregatePoints.length} />
              <TrendChart label="Cost trend" values={aggregatePoints.map((point) => point.estimatedUsd)} pointCount={aggregatePoints.length} />
              <small>{latestAggregatePoint?.totalTokens.toLocaleString() ?? '0'} observed input/cache tokens · ${(latestAggregatePoint?.estimatedUsd ?? 0).toFixed(4)}</small>
            </article>
            <article>
              <h4>Agent churn</h4>
              <div className="brain-vitals-panel__churn" aria-label="Agent churn chart">
                <span style={{ '--bar-value': snapshot.churn.completed } as React.CSSProperties}>Completed {snapshot.churn.completed}</span>
                <span style={{ '--bar-value': snapshot.churn.failed } as React.CSSProperties}>Failed {snapshot.churn.failed}</span>
                <span style={{ '--bar-value': snapshot.churn.stopped } as React.CSSProperties}>Stopped {snapshot.churn.stopped}</span>
                <span style={{ '--bar-value': snapshot.churn.active } as React.CSSProperties}>Active {snapshot.churn.active}</span>
              </div>
            </article>
          </div>

          <section className="brain-vitals-panel__runs" aria-labelledby="brain-vitals-runs-heading">
            <h4 id="brain-vitals-runs-heading">Runs and tasks</h4>
            {selectedRuns.length === 0 ? (
              <p className="rail-card__empty">No runs found for this brain.</p>
            ) : (
              <ol>
                {selectedRuns.map((run) => (
                  <li key={run.id}>
                    <button type="button" aria-label={`Open vitals for run ${run.id}`} onClick={() => void openRun(run.id)}>
                      <span>{run.id}</span>
                      <small>{run.status} · {new Date(run.createdAt).toLocaleString()}</small>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <SlideInPanel
        isOpen={selectedRunId !== null}
        onClose={() => {
          runRequestRef.current += 1;
          setSelectedRunId(null);
          setRunDetail(null);
          setRunError(null);
        }}
        title={selectedRunId ? `Run ${selectedRunId} vitals` : 'Run vitals'}
      >
        <div className="brain-vitals-detail">
          <header>
            <div><small>Run drill-down</small><h3>{selectedRunId}</h3></div>
            <button type="button" aria-label="Close run vitals" onClick={() => {
              runRequestRef.current += 1;
              setSelectedRunId(null);
            }}>×</button>
          </header>
          {runLoading && <p role="status">Loading run telemetry...</p>}
          {runError && <p role="alert">{runError}</p>}
          {runDetail && <RunDetail detail={runDetail} />}
        </div>
      </SlideInPanel>
    </section>
  );
}

function RunDetail({ detail }: { detail: BrainVitalsRunDetail }) {
  const resources = [...detail.resources].sort((left, right) => left.timestamp - right.timestamp);
  const peakRss = resources.reduce((peak, sample) => Math.max(peak, sample.rssBytes), 0);
  const peakCpu = resources.reduce((peak, sample) => Math.max(peak, sample.cpuPercent), 0);
  return (
    <div className="brain-vitals-detail__content">
      <dl>
        <div><dt>Status</dt><dd>{detail.run.status}</dd></div>
        <div><dt>Churn classification</dt><dd>{detail.churn.classification}</dd></div>
        <div><dt>Total tokens</dt><dd>{detail.tokens.totalTokens.toLocaleString()}</dd></div>
        <div><dt>Cache split</dt><dd>{detail.tokens.cacheReadTokens.toLocaleString()} read / {detail.tokens.cacheCreationTokens.toLocaleString()} created</dd></div>
        <div><dt>Cost</dt><dd>${detail.cost.estimatedUsd.toFixed(4)}{detail.cost.budgetUsd === null ? '' : ` / $${detail.cost.budgetUsd.toFixed(2)} budget`}</dd></div>
        <div><dt>Compaction</dt><dd>{detail.compactions.length} {detail.compactions.length === 1 ? 'compaction' : 'compactions'}</dd></div>
        <div><dt>Resources</dt><dd>{resources.length === 0 ? 'Resource telemetry unavailable' : `${Math.round(peakCpu)}% peak CPU · ${Math.round(peakRss / 1024 / 1024)} MB peak RSS`}</dd></div>
      </dl>
      <section>
        <h4>Resource samples</h4>
        <TrendChart label="Run resource samples" values={resources.map((sample) => sample.cpuPercent)} pointCount={resources.length} />
      </section>
      <section>
        <h4>Activity events</h4>
        {detail.events.length === 0 ? <p>No persisted activity events.</p> : (
          <ol>{detail.events.map((event) => <li key={event.id}>{event.type} · {event.createdAt}</li>)}</ol>
        )}
        {detail.eventsTruncated && <small>Only the newest activity events are shown.</small>}
      </section>
    </div>
  );
}
