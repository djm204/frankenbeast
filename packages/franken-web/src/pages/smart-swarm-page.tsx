import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SmartSwarmApiError,
  type MissionCompletionStatus,
  type RuntimeAgent,
  type RuntimeAction,
  type RuntimeCapability,
  type RuntimeConnectionState,
  type RuntimeEvent,
  type RuntimeProvider,
  type RuntimeRun,
  type RuntimeSection,
  type RuntimeSnapshot,
  type RuntimeTask,
  type RuntimeWorkspace,
  type SmartSwarmApiClient,
} from '../lib/smart-swarm-api';
import { RuntimeBrainPulse } from '../components/smart-swarm/runtime-brain-pulse';

interface SmartSwarmPageProps {
  client: SmartSwarmApiClient;
}

interface PendingActionIntent {
  idempotencyKey: string;
  providerId: string;
  workspaceId: string;
  taskId: string;
  action: RuntimeAction['type'];
  inFlight: boolean;
  awaitingConfirmation: boolean;
}

const MAX_VISIBLE_TASKS = 200;
const MAX_VISIBLE_EVIDENCE = 100;
const STREAM_REFRESH_DEBOUNCE_MS = 250;
const TOPOLOGY_REFRESH_INTERVAL_MS = 5_000;
const DEFAULT_COMPLETION_POLL_INTERVAL_MS = 30_000;
const MIN_COMPLETION_POLL_INTERVAL_MS = 10_000;
const TERMINAL_RUN_STATES = new Set(['succeeded', 'failed', 'cancelled']);

function actionIntentKey(
  providerId: string,
  workspaceId: string,
  taskId: string,
  action: RuntimeAction['type'],
): string {
  return JSON.stringify([providerId, workspaceId, taskId, action]);
}

function available<T>(section: RuntimeSection<T>): T | null {
  return section.status === 'available' ? section.data : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The smart-swarm request failed.';
}

function capabilityReason(capability: RuntimeCapability): string | null {
  return capability.status === 'unsupported' ? capability.reason : null;
}

function actionPostconditionConfirmed(
  intent: PendingActionIntent,
  task: RuntimeTask,
  blockers: Array<{ workspaceId: string; taskId: string }> | null,
): boolean {
  switch (intent.action) {
    case 'blocker.resolve':
      return task.state !== 'blocked'
        && blockers !== null
        && !blockers.some((blocker) => (
          blocker.workspaceId === intent.workspaceId && blocker.taskId === intent.taskId
        ));
    case 'task.cancel':
      return task.state === 'cancelled';
    case 'policy.apply':
      return task.state === 'ready' || task.state === 'running';
    case 'task.pause':
      return task.state === 'queued';
    case 'task.resume':
      return task.state === 'ready' || task.state === 'running';
    default:
      return false;
  }
}

function taskActivityRank(state: RuntimeTask['state']): number {
  const rank: Record<RuntimeTask['state'], number> = {
    blocked: 0,
    running: 1,
    ready: 2,
    queued: 3,
    unknown: 4,
    failed: 5,
    succeeded: 6,
    cancelled: 7,
    archived: 8,
  };
  return rank[state];
}

function compareTaskActivity(left: RuntimeTask, right: RuntimeTask): number {
  const stateDifference = taskActivityRank(left.state) - taskActivityRank(right.state);
  if (stateDifference !== 0) return stateDifference;
  const priorityDifference = (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER);
  if (priorityDifference !== 0) return priorityDifference;
  const recencyDifference = Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt);
  return recencyDifference !== 0 ? recencyDifference : left.id.localeCompare(right.id);
}

function preferredWorkspaceId(workspaces: RuntimeWorkspace[]): string {
  return workspaces.find((workspace) => workspace.state === 'available')?.id
    ?? workspaces.find((workspace) => workspace.state === 'degraded')?.id
    ?? workspaces[0]?.id
    ?? '';
}

function compareAgentActivity(left: RuntimeAgent, right: RuntimeAgent): number {
  const rank: Record<RuntimeAgent['state'], number> = {
    blocked: 0,
    running: 1,
    idle: 2,
    unknown: 3,
    offline: 4,
  };
  const stateDifference = rank[left.state] - rank[right.state];
  if (stateDifference !== 0) return stateDifference;
  const leftActiveAt = left.lastActiveAt ? Date.parse(left.lastActiveAt) : 0;
  const rightActiveAt = right.lastActiveAt ? Date.parse(right.lastActiveAt) : 0;
  return rightActiveAt - leftActiveAt || left.id.localeCompare(right.id);
}

function compareRuntimeEvidenceRecency(
  left: { id: string; occurredAt: string },
  right: { id: string; occurredAt: string },
): number {
  return Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.id.localeCompare(right.id);
}

function compareRuntimeRunRecency(left: RuntimeRun, right: RuntimeRun): number {
  const leftAt = left.finishedAt ?? left.lastActiveAt ?? left.startedAt;
  const rightAt = right.finishedAt ?? right.lastActiveAt ?? right.startedAt;
  return Date.parse(rightAt) - Date.parse(leftAt) || left.id.localeCompare(right.id);
}

function StateNotice({ provider, snapshot, workspaceName, error, onRetry }: {
  provider: RuntimeProvider | undefined;
  snapshot: RuntimeSnapshot | null;
  workspaceName: string | undefined;
  error: unknown;
  onRetry(): void;
}) {
  if (error) {
    const authentication = error instanceof SmartSwarmApiError && (error.status === 401 || error.status === 403);
    return (
      <section className="smart-swarm-state smart-swarm-state--error" role="alert">
        <h2>{authentication ? 'Operator authentication required' : 'Smart-swarm unavailable'}</h2>
        <p>{authentication ? 'Authenticate this dashboard with an operator token, then retry.' : errorMessage(error)}</p>
        <button className="button button--secondary button--compact" onClick={onRetry} type="button">Retry smart-swarm</button>
      </section>
    );
  }
  if (!snapshot) return null;
  if (snapshot.state === 'loading') {
    return (
      <section className="smart-swarm-state" role="status">
        <h2>Runtime state is loading</h2>
        <p>{snapshot.message ?? `${provider?.displayName ?? snapshot.providerId} is still preparing normalized runtime evidence.`}</p>
      </section>
    );
  }
  if (snapshot.state === 'empty') {
    return (
      <section className="smart-swarm-state">
        <h2>No runtime work in {workspaceName ?? provider?.displayName ?? snapshot.providerId}</h2>
        <p>{workspaceName
          ? 'The selected workspace reported no tasks. No demo data has been substituted.'
          : 'The selected provider reported no workspaces or tasks. No demo data has been substituted.'}</p>
      </section>
    );
  }
  if (snapshot.state === 'degraded') {
    return (
      <section className="smart-swarm-state smart-swarm-state--warning" role="status">
        <h2>Live state is degraded</h2>
        <p>{snapshot.message ?? 'Some normalized runtime sections are temporarily unavailable.'}</p>
      </section>
    );
  }
  if (snapshot.state === 'schema-incompatible') {
    return (
      <section className="smart-swarm-state smart-swarm-state--warning" role="alert">
        <h2>Runtime schema unsupported</h2>
        <p>{snapshot.message ?? 'This provider schema is not compatible with the smart-swarm contract.'}</p>
      </section>
    );
  }
  if (snapshot.state === 'unavailable') {
    return (
      <section className="smart-swarm-state smart-swarm-state--error" role="alert">
        <h2>{provider?.displayName ?? snapshot.providerId} is unavailable</h2>
        <p>{snapshot.message ?? 'The runtime source could not be read.'}</p>
      </section>
    );
  }
  return null;
}

function UnsupportedSection({ label, section }: { label: string; section: RuntimeSection<unknown> }) {
  if (section.status === 'available') return null;
  return (
    <p className="smart-swarm-unsupported" role="note">
      <strong>{label} unsupported:</strong> {section.reason}
    </p>
  );
}

function MetricProvenance({
  label,
  provider,
  capturedAt,
  section,
}: {
  label: string;
  provider: RuntimeProvider | undefined;
  capturedAt: string;
  section: RuntimeSection<unknown[]>;
}) {
  const source = provider?.displayName ?? 'Unknown runtime adapter';
  return (
    <div data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <dt>{label}</dt>
      <dd>
        <strong>{section.status === 'available' ? section.data.length : 'unsupported'}</strong>
        <span>{section.status}</span>
        <small>Source: {source} · Captured {new Date(capturedAt).toLocaleString()}</small>
      </dd>
    </div>
  );
}

function MetricCount({
  availableText,
  capturedAt,
  label,
  provider,
  section,
}: {
  availableText: string;
  capturedAt: string;
  label: string;
  provider: RuntimeProvider | undefined;
  section: RuntimeSection<unknown[]>;
}) {
  if (section.status === 'unsupported') {
    return <span title={section.reason}>{label} unsupported</span>;
  }
  return (
    <span title={`${label} available from ${provider?.displayName ?? 'runtime adapter'}. Captured ${new Date(capturedAt).toLocaleString()}.`}>
      {availableText}
    </span>
  );
}

function EventMetricCount({
  capturedAt,
  count,
  liveEventCount,
  provider,
  section,
}: {
  capturedAt: string;
  count: number;
  liveEventCount: number;
  provider: RuntimeProvider | undefined;
  section: RuntimeSection<RuntimeEvent[]>;
}) {
  const source = provider?.displayName ?? 'runtime adapter';
  if (section.status === 'unsupported') {
    if (liveEventCount === 0) return <span title={section.reason}>Events unsupported</span>;
    return (
      <span title={`Events received live from ${source}.`}>
        {count} live {count === 1 ? 'event' : 'events'}
      </span>
    );
  }
  const streamProvenance = liveEventCount > 0 ? '; includes events received by the live stream' : '';
  return (
    <span title={`Events available from ${source}. Snapshot captured ${new Date(capturedAt).toLocaleString()}${streamProvenance}.`}>
      {count}
    </span>
  );
}

export function SmartSwarmPage({ client }: SmartSwarmPageProps) {
  const [providers, setProviders] = useState<RuntimeProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceCatalog, setWorkspaceCatalog] = useState<RuntimeSnapshot['workspaces'] | null>(null);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [missionCompletion, setMissionCompletion] = useState<MissionCompletionStatus | null>(null);
  const [missionCompletionUnavailable, setMissionCompletionUnavailable] = useState(false);
  const [liveEvents, setLiveEvents] = useState<RuntimeEvent[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedPulseSource, setSelectedPulseSource] = useState<RuntimeEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<unknown>(null);
  const [snapshotError, setSnapshotError] = useState<unknown>(null);
  const [workspaceCatalogError, setWorkspaceCatalogError] = useState<unknown>(null);
  const [streamError, setStreamError] = useState<unknown>(null);
  const [connection, setConnection] = useState<RuntimeConnectionState>('connecting');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [completionRefreshNonce, setCompletionRefreshNonce] = useState(0);
  const [providerRefreshNonce, setProviderRefreshNonce] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRequestsInFlight = useRef(0);
  const snapshotRequestGeneration = useRef(0);
  const snapshotScope = useRef('');
  const refreshPending = useRef(false);
  const lastTopologyRefreshAt = useRef(0);
  const currentProviderId = useRef(providerId);
  currentProviderId.current = providerId;
  const currentWorkspaceId = useRef(workspaceId);
  currentWorkspaceId.current = workspaceId;
  const taskDetailTrigger = useRef<HTMLButtonElement | null>(null);
  const actionIdempotencyKeys = useRef(new Map<string, PendingActionIntent>());

  const provider = providers.find((candidate) => candidate.id === providerId);
  const error = snapshotError ?? providerError ?? workspaceCatalogError ?? streamError;
  const workspaces = available(workspaceCatalog ?? snapshot?.workspaces ?? { status: 'available', data: [] }) ?? [];
  const agents = snapshot ? available(snapshot.agents) ?? [] : [];
  const tasks = snapshot ? available(snapshot.tasks) ?? [] : [];
  const runs = snapshot ? available(snapshot.runs) ?? [] : [];
  const events = snapshot
    ? [...new Map([
      ...(available(snapshot.events) ?? []),
      ...liveEvents,
    ].map((event) => [event.id, event])).values()]
      .sort(compareRuntimeEvidenceRecency)
    : [];
  const blockers = snapshot
    ? [...(available(snapshot.blockers) ?? [])]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
    : [];
  const confirmedBlockers = snapshot?.blockers.status === 'available' ? blockers : null;
  const approvals = snapshot
    ? [...(available(snapshot.approvals) ?? [])]
      .sort((left, right) => {
        const stateDifference = Number(right.state === 'pending') - Number(left.state === 'pending');
        if (stateDifference !== 0) return stateDifference;
        return Date.parse(right.resolvedAt ?? right.createdAt) - Date.parse(left.resolvedAt ?? left.createdAt)
          || left.id.localeCompare(right.id);
      })
    : [];
  const selectedTaskLookupId = selectedTaskId ?? selectedPulseSource?.taskId ?? null;
  const selectedTask = tasks.find((task) => (
    task.id === selectedTaskLookupId
    && (!selectedPulseSource || task.workspaceId === selectedPulseSource.workspaceId)
  )) ?? null;
  const referencedRun = selectedPulseSource?.runId
    ? runs.find((run) => (
      run.id === selectedPulseSource.runId
      && run.workspaceId === selectedPulseSource.workspaceId
      && run.taskId === selectedPulseSource.taskId
    )) ?? null
    : null;
  const selectedTaskRuns = selectedTask
    ? [...new Map([
        ...(referencedRun ? [referencedRun] : []),
        ...runs.filter((run) => (
          run.taskId === selectedTask.id && run.workspaceId === selectedTask.workspaceId
        )).sort(compareRuntimeRunRecency),
      ].map((run) => [run.id, run])).values()].slice(0, 20)
    : [];
  const selectedTaskActionPending = selectedTask
    ? [...actionIdempotencyKeys.current.values()].some((intent) => (
        intent.providerId === providerId
        && intent.workspaceId === selectedTask.workspaceId
        && intent.taskId === selectedTask.id
        && (intent.inFlight || intent.awaitingConfirmation)
        && !actionPostconditionConfirmed(intent, selectedTask, confirmedBlockers)
      ))
    : false;

  useEffect(() => {
    for (const [key, intent] of actionIdempotencyKeys.current) {
      if (intent.providerId !== providerId) continue;
      const currentTask = tasks.find((task) => (
        task.workspaceId === intent.workspaceId && task.id === intent.taskId
      ));
      if (currentTask && actionPostconditionConfirmed(intent, currentTask, confirmedBlockers)) {
        actionIdempotencyKeys.current.delete(key);
      }
    }
  }, [confirmedBlockers, providerId, tasks]);

  const taskNames = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);
  const newestUnfinishedRunByTask = useMemo(() => {
    const indexed = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (run.finishedAt !== null || TERMINAL_RUN_STATES.has(run.state)) continue;
      const current = indexed.get(run.taskId);
      if (!current || Date.parse(run.lastActiveAt ?? run.startedAt) > Date.parse(current.lastActiveAt ?? current.startedAt)) {
        indexed.set(run.taskId, run);
      }
    }
    return indexed;
  }, [runs]);

  const scheduleTopologyRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    const elapsed = Date.now() - lastTopologyRefreshAt.current;
    const delay = Math.max(STREAM_REFRESH_DEBOUNCE_MS, TOPOLOGY_REFRESH_INTERVAL_MS - elapsed);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      if (snapshotRequestsInFlight.current > 0) {
        refreshPending.current = true;
        return;
      }
      lastTopologyRefreshAt.current = Date.now();
      setRefreshNonce((current) => current + 1);
    }, delay);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void client.listProviders()
      .then((nextProviders) => {
        if (cancelled) return;
        setProviders(nextProviders);
        const current = currentProviderId.current;
        const nextProviderId = nextProviders.some((candidate) => candidate.id === current)
          ? current
          : nextProviders[0]?.id ?? '';
        if (nextProviderId !== current) {
          currentProviderId.current = nextProviderId;
          currentWorkspaceId.current = '';
          setSnapshot(null);
          setLiveEvents([]);
          setWorkspaceCatalog(null);
          setWorkspaceId('');
          setSelectedPulseSource(null);
          setSelectedTaskId(null);
          setSnapshotError(null);
          setWorkspaceCatalogError(null);
          setStreamError(null);
        }
        setProviderId(nextProviderId);
        setProviderError(null);
        if (nextProviders.length === 0) setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setProviderError(nextError);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [client, providerRefreshNonce]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let intervalMs = DEFAULT_COMPLETION_POLL_INTERVAL_MS;
    const pollCompletion = async (): Promise<void> => {
      try {
        const completion = await client.fetchMissionCompletion();
        if (cancelled) return;
        setMissionCompletion(completion);
        setMissionCompletionUnavailable(false);
        if (completion.evidenceMaxAgeMs !== undefined) {
          intervalMs = Math.max(
            MIN_COMPLETION_POLL_INTERVAL_MS,
            Math.min(DEFAULT_COMPLETION_POLL_INTERVAL_MS, completion.evidenceMaxAgeMs / 2),
          );
        }
      } catch {
        if (cancelled) return;
        setMissionCompletionUnavailable(true);
      }
      timer = setTimeout(() => { void pollCompletion(); }, intervalMs);
    };
    void pollCompletion();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, completionRefreshNonce]);

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    const nextScope = `${providerId}\0${workspaceId}`;
    if (snapshotScope.current !== nextScope) {
      snapshotScope.current = nextScope;
      snapshotRequestGeneration.current += 1;
      setLiveEvents([]);
      snapshotRequestsInFlight.current = 0;
      refreshPending.current = false;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
    const requestGeneration = snapshotRequestGeneration.current;
    setLoading(true);
    snapshotRequestsInFlight.current += 1;
    void client.fetchSnapshot(providerId, {
      ...(workspaceId ? { workspaceId } : {}),
      activityLimit: 100,
    })
      .then((nextSnapshot) => {
        if (cancelled || currentProviderId.current !== providerId) return;
        setSnapshot(nextSnapshot);
        if (!workspaceId) setWorkspaceCatalog(nextSnapshot.workspaces);
        if (nextSnapshot.workspaces.status === 'available') {
          const nextWorkspaces = nextSnapshot.workspaces.data;
          setWorkspaceId((current) => (
            nextWorkspaces.some((workspace) => workspace.id === current)
              ? current
              : preferredWorkspaceId(nextWorkspaces)
          ));
        }
        setSelectedTaskId((current) => (
          current && (available(nextSnapshot.tasks) ?? []).some((task) => task.id === current)
            ? current
            : null
        ));
        setSnapshotError(null);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (!cancelled && currentProviderId.current === providerId) {
          setSnapshotError(nextError);
          setLoading(false);
        }
      })
      .finally(() => {
        if (snapshotRequestGeneration.current !== requestGeneration) return;
        snapshotRequestsInFlight.current -= 1;
        if (snapshotRequestsInFlight.current === 0 && refreshPending.current) {
          refreshPending.current = false;
          scheduleTopologyRefresh();
        }
      });
    return () => { cancelled = true; };
  }, [client, providerId, workspaceId, refreshNonce, scheduleTopologyRefresh]);

  useEffect(() => {
    if (!provider || provider.capabilities.streaming.status !== 'supported') {
      setConnection('unavailable');
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    lastTopologyRefreshAt.current = 0;
    setConnection('connecting');
    void client.subscribe(provider.id, workspaceId || undefined, {
      connection: (state) => {
        if (!cancelled) {
          setConnection(state);
          if (state === 'connected') setStreamError(null);
        }
      },
      error: (streamError) => {
        if (!cancelled) setStreamError(streamError);
      },
      event: (event: RuntimeEvent) => {
        if (cancelled) return;
        setLiveEvents((current) => [
          event,
          ...current.filter((candidate) => candidate.id !== event.id),
        ].sort(compareRuntimeEvidenceRecency).slice(0, MAX_VISIBLE_EVIDENCE));
        scheduleTopologyRefresh();
      },
    }).then((stop) => {
      if (cancelled) stop();
      else unsubscribe = stop;
    }).catch((streamError: unknown) => {
      if (!cancelled) setStreamError(streamError);
    });
    return () => {
      cancelled = true;
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      unsubscribe?.();
    };
  }, [client, provider, workspaceId, scheduleTopologyRefresh]);

  const filteredAgents = agents.filter((agent) => !workspaceId || agent.workspaceId === workspaceId);
  const visibleAgents = [...filteredAgents].sort(compareAgentActivity).slice(0, MAX_VISIBLE_EVIDENCE);
  const filteredTasks = tasks.filter((task) => !workspaceId || task.workspaceId === workspaceId);
  const visibleTasks = [...filteredTasks]
    .sort(compareTaskActivity)
    .slice(0, MAX_VISIBLE_TASKS);
  const pulseEvents = events.filter((event) => !workspaceId || event.workspaceId === workspaceId);
  const filteredEvents = [...pulseEvents]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 100);
  const filteredBlockers = blockers.filter((blocker) => !workspaceId || blocker.workspaceId === workspaceId);
  const filteredApprovals = approvals.filter((approval) => !workspaceId || approval.workspaceId === workspaceId);
  const visibleBlockers = filteredBlockers.slice(0, MAX_VISIBLE_EVIDENCE);
  const visibleApprovals = filteredApprovals.slice(0, MAX_VISIBLE_EVIDENCE);

  async function refreshWorkspaceCatalog(): Promise<void> {
    if (!providerId || loading) return;
    const requestedProviderId = providerId;
    setLoading(true);
    try {
      const catalogSnapshot = await client.fetchSnapshot(requestedProviderId, { activityLimit: 1 });
      if (currentProviderId.current !== requestedProviderId) return;
      setWorkspaceCatalog(catalogSnapshot.workspaces);
      if (catalogSnapshot.workspaces.status === 'available') {
        const catalogWorkspaces = catalogSnapshot.workspaces.data;
        if (!catalogWorkspaces.some((workspace) => workspace.id === currentWorkspaceId.current)) {
          setSnapshot(null);
          setSelectedPulseSource(null);
          setSelectedTaskId(null);
          setWorkspaceId(preferredWorkspaceId(catalogWorkspaces));
        }
      }
      setWorkspaceCatalogError(null);
    } catch (nextError) {
      if (currentProviderId.current === requestedProviderId) setWorkspaceCatalogError(nextError);
    } finally {
      if (currentProviderId.current === requestedProviderId) setLoading(false);
    }
  }

  if (loading && !snapshot) {
    return <main className="smart-swarm-page" aria-busy="true"><p role="status">Loading smart-swarm live state…</p></main>;
  }

  if (!loading && providers.length === 0 && !error) {
    return (
      <main className="smart-swarm-page">
        <section className="smart-swarm-state">
          <h2>No smart-swarm runtimes configured</h2>
          <p>No provider was returned by the normalized runtime API.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="smart-swarm-page">
      <header className="smart-swarm-header rail-card">
        <div>
          <p className="eyebrow">Provider-neutral runtime</p>
          <h2>Smart Swarm</h2>
          <p>The canonical live operations surface for normalized topology and bounded provider evidence.</p>
        </div>
        <div className="smart-swarm-selectors">
          <label className="field-stack">
            <span>Runtime provider</span>
            <select
              aria-label="Runtime provider"
              className="field-control"
              onChange={(event) => {
                setSnapshot(null);
                setLiveEvents([]);
                setWorkspaceCatalog(null);
                setWorkspaceId('');
                setSelectedPulseSource(null);
                setSelectedTaskId(null);
                setWorkspaceCatalogError(null);
                setStreamError(null);
                setProviderId(event.target.value);
              }}
              value={providerId}
            >
              {providers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}
            </select>
          </label>
          <label className="field-stack">
            <span>Workspace</span>
            <select
              aria-label="Workspace"
              className="field-control"
              disabled={workspaces.length === 0}
              onChange={(event) => {
                setSnapshot(null);
                setLiveEvents([]);
                setSelectedPulseSource(null);
                setSelectedTaskId(null);
                setLoading(true);
                setWorkspaceId(event.target.value);
              }}
              value={workspaceId}
            >
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <button
            className="button button--secondary button--compact"
            disabled={loading || !providerId}
            onClick={() => { void refreshWorkspaceCatalog(); }}
            type="button"
          >
            Refresh workspaces
          </button>
          <button
            className="button button--secondary button--compact"
            disabled={loading || !providerId}
            onClick={() => {
              setRefreshNonce((current) => current + 1);
              setCompletionRefreshNonce((current) => current + 1);
            }}
            type="button"
          >
            Refresh topology
          </button>
          {snapshot ? <UnsupportedSection label="Workspaces" section={workspaceCatalog ?? snapshot.workspaces} /> : null}
        </div>
        <div className="smart-swarm-connection" role="status">
          <strong>{connection === 'connected'
            ? 'Live · connected'
            : connection === 'reconnecting'
              ? 'Connection lost · reconnecting'
              : connection === 'unavailable'
                ? 'Live updates unavailable'
                : 'Connecting · connecting'}</strong>
        </div>
      </header>

      <StateNotice
        error={error}
        onRetry={() => {
          setProviderRefreshNonce((current) => current + 1);
          setRefreshNonce((current) => current + 1);
          setCompletionRefreshNonce((current) => current + 1);
          if (workspaceCatalogError) void refreshWorkspaceCatalog();
        }}
        provider={provider}
        snapshot={snapshot}
        workspaceName={workspaces.find((workspace) => workspace.id === workspaceId)?.name}
      />
      {loading ? <p className="smart-swarm-refresh" role="status">Refreshing normalized state…</p> : null}

      {missionCompletionUnavailable ? (
        <p role="alert">
          {missionCompletion
            ? 'Mission completion unavailable; showing last known status.'
            : 'Mission completion unavailable.'}
        </p>
      ) : null}

      {missionCompletion ? (
        <section className="smart-swarm-capabilities rail-card" aria-label="Mission completion">
          <div>
            <p className="eyebrow">Authoritative completion gate</p>
            <h3>Mission completion</h3>
            <p>{missionCompletion.terminal ? 'Complete' : 'In progress'}</p>
            <small>Checked {new Date(missionCompletion.checkedAt).toLocaleString()}</small>
          </div>
          <dl>
            <div><dt>Implementation</dt><dd>Implementation: {missionCompletion.stages.implementation}</dd></div>
            <div><dt>Review</dt><dd>Review: {missionCompletion.stages.reviewed}</dd></div>
            <div><dt>Merge</dt><dd>Merge: {missionCompletion.stages.merged}</dd></div>
            <div><dt>Deployment</dt><dd>Deployment: {missionCompletion.stages.deployed}</dd></div>
            <div><dt>Real data</dt><dd>Real data: {missionCompletion.stages.realDataAccepted}</dd></div>
            <div><dt>Completion</dt><dd>Completion: {missionCompletion.stages.completion}</dd></div>
          </dl>
          {missionCompletion.blockers.length > 0 ? (
            <ul>{missionCompletion.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          ) : null}
          {missionCompletion.externalGates && missionCompletion.externalGates.length > 0 ? (
            <ul aria-label="External mission gates">
              {missionCompletion.externalGates.map((gate) => (
                <li key={gate.id}>
                  <strong>{gate.id}</strong>: {gate.state}
                  {' · '}Owner: {gate.owner ?? 'unassigned'}
                  {' · '}Trigger: {gate.trigger ?? 'missing'}
                  {' · '}Next: {gate.nextTransition ?? 'missing'}
                  {' · '}Head: {gate.head ?? 'missing'}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {snapshot ? (
        <>
          {provider ? (
            <RuntimeBrainPulse
              connection={connection}
              eventLimit={MAX_VISIBLE_EVIDENCE}
              events={pulseEvents}
              onOpenTask={(event, trigger) => {
                taskDetailTrigger.current = trigger;
                setSelectedPulseSource(event);
                setSelectedTaskId(event.taskId);
              }}
              provider={provider}
              snapshot={snapshot}
            />
          ) : null}
          <section className="smart-swarm-capabilities rail-card" aria-label="Provider capabilities">
            <div>
              <p className="eyebrow">Runtime status</p>
              <h3>{provider?.displayName ?? snapshot.providerId}</h3>
              <p>{snapshot.state === 'ready'
                ? provider?.health.message ?? provider?.health.state ?? snapshot.state
                : snapshot.state}</p>
            </div>
            <dl>
              {provider ? Object.entries(provider.capabilities).map(([name, capability]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd title={capabilityReason(capability) ?? undefined}>{capability.status}</dd>
                </div>
              )) : null}
            </dl>
          </section>

          <section className="smart-swarm-capabilities rail-card" aria-label="Live metric provenance">
            <div>
              <p className="eyebrow">Availability and provenance</p>
              <h3>Live metrics</h3>
              <p>Counts are shown only when the selected runtime adapter supplies that section.</p>
            </div>
            <dl>
              <MetricProvenance label="Workspaces" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.workspaces} />
              <MetricProvenance label="Agents" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.agents} />
              <MetricProvenance label="Tasks" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.tasks} />
              <MetricProvenance label="Runs" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.runs} />
              <MetricProvenance label="Event history" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.events} />
              <MetricProvenance label="Blockers" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.blockers} />
              <MetricProvenance label="Approvals" provider={provider} capturedAt={snapshot.capturedAt} section={snapshot.approvals} />
            </dl>
          </section>

          <div className="smart-swarm-layout">
            <section className="smart-swarm-topology rail-card" aria-label="Runtime topology">
              <div className="rail-card__header">
                <div><p className="eyebrow">Topology</p><h3>Tasks and agents</h3></div>
                <MetricCount
                  availableText={filteredTasks.length > MAX_VISIBLE_TASKS
                    ? `Showing ${MAX_VISIBLE_TASKS} of ${filteredTasks.length} tasks`
                    : `${filteredTasks.length} tasks`}
                  capturedAt={snapshot.capturedAt}
                  label="Tasks"
                  provider={provider}
                  section={snapshot.tasks}
                />
              </div>
              <UnsupportedSection label="Agents" section={snapshot.agents} />
              <UnsupportedSection label="Tasks" section={snapshot.tasks} />
              <UnsupportedSection label="Runs" section={snapshot.runs} />
              {filteredAgents.length > MAX_VISIBLE_EVIDENCE
                ? <p>Showing {MAX_VISIBLE_EVIDENCE} of {filteredAgents.length} agents</p>
                : null}
              <div className="smart-swarm-agents">
                {visibleAgents.map((agent) => (
                  <article className={`smart-swarm-agent smart-swarm-agent--${agent.state}`} key={agent.id}>
                    <strong>{agent.displayName}</strong>
                    <span>{String(agent.metadata?.role ?? 'agent')} · {agent.state}</span>
                  </article>
                ))}
              </div>
              <ol className="smart-swarm-tasks">
                {visibleTasks.map((task) => {
                  const parents = [...new Set(task.parentIds)]
                    .map((id) => ({ id, label: taskNames.get(id) ?? id }));
                  const dependencies = [...new Set(task.dependencyIds)]
                    .map((id) => ({ id, label: taskNames.get(id) ?? id }));
                  const currentRun = newestUnfinishedRunByTask.get(task.id);
                  return (
                    <li key={task.id}>
                      <button
                        aria-label={`Inspect ${task.title}`}
                        className="smart-swarm-task"
                        onClick={(event) => {
                          taskDetailTrigger.current = event.currentTarget;
                          setSelectedPulseSource(null);
                          setSelectedTaskId(task.id);
                        }}
                        type="button"
                      >
                        <span><strong>{task.title}</strong><small>{task.state} · priority {task.priority ?? 'unset'}</small></span>
                        <span>{currentRun
                          ? `Run ${currentRun.id}: ${currentRun.state}`
                          : snapshot.runs.status === 'unsupported' ? 'Runs unsupported' : 'No current run'}</span>
                        {parents.map((parent) => <small key={`parent:${parent.id}`}>Parent {parent.label}</small>)}
                        {dependencies.map((dependency) => <small key={`dependency:${dependency.id}`}>Depends on {dependency.label}</small>)}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>

            <aside className="smart-swarm-evidence">
              <section className="rail-card">
                <div className="rail-card__header">
                  <div><p className="eyebrow">Activity</p><h3>Events and logs</h3></div>
                  <EventMetricCount
                    capturedAt={snapshot.capturedAt}
                    count={filteredEvents.length}
                    liveEventCount={liveEvents.length}
                    provider={provider}
                    section={snapshot.events}
                  />
                </div>
                <UnsupportedSection label="Event history" section={snapshot.events} />
                <ol className="smart-swarm-timeline">
                  {filteredEvents.map((event) => (
                    <li key={event.id}><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString()}</time><strong>{event.type}</strong><span>{event.summary}</span></li>
                  ))}
                </ol>
              </section>
              <section className="rail-card">
                <p className="eyebrow">Blockers</p>
                <UnsupportedSection label="Blockers" section={snapshot.blockers} />
                {filteredBlockers.length > MAX_VISIBLE_EVIDENCE
                  ? <p>Showing {MAX_VISIBLE_EVIDENCE} of {filteredBlockers.length} blockers</p>
                  : null}
                {visibleBlockers.map((blocker) => <article key={blocker.id}><strong>{blocker.category}</strong><p>{blocker.summary}</p></article>)}
              </section>
              <section className="rail-card">
                <p className="eyebrow">Approvals</p>
                <UnsupportedSection label="Approvals" section={snapshot.approvals} />
                {filteredApprovals.length > MAX_VISIBLE_EVIDENCE
                  ? <p>Showing {MAX_VISIBLE_EVIDENCE} of {filteredApprovals.length} approvals</p>
                  : null}
                {visibleApprovals.map((approval) => <article key={approval.id}><strong>{approval.state}</strong><p>{approval.summary}</p></article>)}
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {selectedTask && provider ? (
        <TaskDetail
          actionIdempotencyKeys={actionIdempotencyKeys.current}
          actionPendingFromStore={selectedTaskActionPending}
          client={client}
          key={`${provider.id}:${selectedTask.id}`}
          onActionApplied={() => {
            setRefreshNonce((current) => current + 1);
            setCompletionRefreshNonce((current) => current + 1);
          }}
          onClose={() => {
            setSelectedPulseSource(null);
            setSelectedTaskId(null);
          }}
          provider={provider}
          returnFocus={taskDetailTrigger.current}
          runs={selectedTaskRuns}
          task={selectedTask}
        />
      ) : selectedPulseSource?.taskId ? (
        <UnavailableSourceDetail
          event={selectedPulseSource}
          onClose={() => {
            setSelectedPulseSource(null);
            setSelectedTaskId(null);
          }}
          referencedRun={referencedRun}
          returnFocus={taskDetailTrigger.current}
        />
      ) : null}
    </main>
  );
}

function UnavailableSourceDetail({ event, referencedRun, returnFocus, onClose }: {
  event: RuntimeEvent;
  referencedRun: RuntimeRun | null;
  returnFocus: HTMLButtonElement | null;
  onClose(): void;
}) {
  const closeButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeButton.current?.focus();
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);
  return (
    <section
      aria-label={`Source task ${event.taskId} unavailable`}
      aria-modal="true"
      className="smart-swarm-detail"
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          onClose();
        } else if (keyEvent.key === 'Tab') {
          keyEvent.preventDefault();
          closeButton.current?.focus();
        }
      }}
      role="dialog"
    >
      <header>
        <div><p className="eyebrow">Unavailable source</p><h3>Task {event.taskId}</h3></div>
        <button className="button button--secondary button--compact" onClick={onClose} ref={closeButton} type="button">Close</button>
      </header>
      <p role="status">The referenced task is outside the bounded task snapshot.</p>
      <dl>
        <div><dt>Event</dt><dd>{event.id}</dd></div>
        <div><dt>Workspace</dt><dd>{event.workspaceId}</dd></div>
      </dl>
      <section>
        <h4>Referenced run evidence</h4>
        {referencedRun ? (
          <article><strong>{referencedRun.id}</strong><span>{referencedRun.state}</span><p>{referencedRun.summary ?? 'No run summary.'}</p></article>
        ) : <p>Referenced run evidence is unavailable.</p>}
      </section>
    </section>
  );
}

function TaskDetail({ task, provider, runs, client, returnFocus, actionIdempotencyKeys, actionPendingFromStore, onActionApplied, onClose }: {
  task: RuntimeTask;
  provider: RuntimeProvider;
  runs: RuntimeSnapshot['runs'] extends RuntimeSection<infer T> ? T : never;
  client: SmartSwarmApiClient;
  returnFocus: HTMLButtonElement | null;
  actionIdempotencyKeys: Map<string, PendingActionIntent>;
  actionPendingFromStore: boolean;
  onActionApplied(): void;
  onClose(): void;
}) {
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const [actionPending, setActionPending] = useState(actionPendingFromStore);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  useEffect(() => {
    setActionPending(actionPendingFromStore);
  }, [actionPendingFromStore]);
  useEffect(() => {
    closeButton.current?.focus();
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);
  const pauseReason = capabilityReason(provider.capabilities.pause);
  const pauseStateReason = 'Pause is disabled because normalized task state does not distinguish paused from queued work.';
  const resumeReason = capabilityReason(provider.capabilities.resume);
  const resumeStateReason = 'Resume is disabled because normalized task state does not distinguish paused from queued work.';
  const cancelReason = capabilityReason(provider.capabilities.cancellation);
  const policyReason = capabilityReason(provider.capabilities.policyActions);
  const blockerReason = capabilityReason(provider.capabilities.blockers);
  const policyStateReason = !['blocked', 'queued'].includes(task.state)
    ? 'Only blocked and queued tasks can be promoted.'
    : null;

  async function executeTaskAction(
    action: 'blocker.resolve' | 'task.pause' | 'task.resume' | 'task.cancel' | 'policy.apply',
    reason: string,
    successMessage: string,
  ): Promise<void> {
    setActionPending(true);
    setActionStatus(null);
    let awaitingConfirmation = false;
    try {
      const runtimeAction: RuntimeAction = action === 'policy.apply'
        ? {
            type: action,
            workspaceId: task.workspaceId,
            taskId: task.id,
            policy: 'promote-task',
            reason,
          }
        : {
            type: action,
            workspaceId: task.workspaceId,
            taskId: task.id,
            reason,
          };
      const intentKey = actionIntentKey(provider.id, task.workspaceId, task.id, action);
      const pendingIntent = actionIdempotencyKeys.get(intentKey);
      const idempotencyKey = pendingIntent?.idempotencyKey ?? `${action}:${crypto.randomUUID()}`;
      const actionIntent = pendingIntent ?? {
        idempotencyKey,
        providerId: provider.id,
        workspaceId: task.workspaceId,
        taskId: task.id,
        action,
        inFlight: true,
        awaitingConfirmation: false,
      };
      actionIntent.inFlight = true;
      actionIdempotencyKeys.set(intentKey, actionIntent);
      const result = await client.executeAction(provider.id, {
        correlationId: crypto.randomUUID(),
        idempotencyKey,
        action: runtimeAction,
      });
      if (result.status === 'applied') {
        const appliedIntent = actionIdempotencyKeys.get(intentKey);
        if (appliedIntent) {
          appliedIntent.awaitingConfirmation = true;
          awaitingConfirmation = true;
        }
        setActionStatus(successMessage);
        onActionApplied();
      } else if (result.status === 'rejected') {
        actionIdempotencyKeys.delete(intentKey);
        setActionStatus(`rejected: ${result.reason}`);
      } else if (result.status === 'failed') {
        actionIdempotencyKeys.delete(intentKey);
        setActionStatus(`failed: ${result.reason}`);
      } else {
        actionIdempotencyKeys.delete(intentKey);
        setActionStatus(`unsupported: ${result.reason}`);
      }
    } catch (error) {
      setActionStatus(errorMessage(error));
    } finally {
      const pendingIntent = actionIdempotencyKeys.get(
        actionIntentKey(provider.id, task.workspaceId, task.id, action),
      );
      if (pendingIntent) pendingIntent.inFlight = false;
      if (!awaitingConfirmation) setActionPending(false);
    }
  }
  return (
    <section
      aria-label={`${task.title} details`}
      aria-modal="true"
      className="smart-swarm-detail"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'Tab') {
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!focusable.some((element) => element === document.activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
      role="dialog"
    >
      <header>
        <div><p className="eyebrow">Task detail</p><h3>{task.title}</h3></div>
        <button className="button button--secondary button--compact" onClick={onClose} ref={closeButton} type="button">Close</button>
      </header>
      <dl>
        <div><dt>Status</dt><dd>{task.state}</dd></div>
        <div><dt>Priority</dt><dd>{task.priority ?? 'unset'}</dd></div>
        <div><dt>Owners</dt><dd>{task.ownerIds.join(', ') || 'unassigned'}</dd></div>
      </dl>
      <section>
        <h4>Bounded run evidence</h4>
        {runs.slice(0, 20).map((run) => <article key={run.id}><strong>{run.id}</strong><span>{run.state}</span><p>{run.summary ?? 'No run summary.'}</p></article>)}
      </section>
      <section className="smart-swarm-actions" aria-label="Task lifecycle controls">
        <h4>Capability-driven controls</h4>
        {task.state === 'blocked' ? (
          <>
            <button
              disabled={actionPending || blockerReason !== null}
              onClick={() => {
                void executeTaskAction(
                  'blocker.resolve',
                  'Resolved from the authenticated smart-swarm dashboard',
                  'Blocker resolved; refreshing live state.',
                );
              }}
              title={blockerReason ?? undefined}
              type="button"
            >Resolve blocker</button>
            {blockerReason ? <p>{blockerReason}</p> : null}
          </>
        ) : null}
        <button
          disabled
          onClick={() => {
            void executeTaskAction(
              'task.pause',
              'Paused from the authenticated smart-swarm dashboard',
              'Task paused; refreshing live state.',
            );
          }}
          title={pauseReason ?? pauseStateReason}
          type="button"
        >Pause task</button>
        {pauseReason ? <p>{pauseReason}</p> : null}
        <button
          disabled
          onClick={() => {
            void executeTaskAction(
              'task.resume',
              'Resumed from the authenticated smart-swarm dashboard',
              'Task resumed; refreshing live state.',
            );
          }}
          title={resumeReason ?? resumeStateReason}
          type="button"
        >Resume task</button>
        {resumeReason ? <p>{resumeReason}</p> : null}
        <button
          disabled={actionPending || cancelReason !== null || !['queued', 'ready', 'running', 'blocked'].includes(task.state)}
          onClick={() => {
            void executeTaskAction(
              'task.cancel',
              'Cancelled from the authenticated smart-swarm dashboard',
              'Task cancelled; refreshing live state.',
            );
          }}
          title={cancelReason ?? undefined}
          type="button"
        >Cancel task</button>
        {cancelReason ? <p>{cancelReason}</p> : null}
        <button
          disabled={actionPending || policyReason !== null || policyStateReason !== null}
          onClick={() => {
            void executeTaskAction(
              'policy.apply',
              'Promoted from the authenticated smart-swarm dashboard',
              'Task promoted; refreshing live state.',
            );
          }}
          title={policyReason ?? policyStateReason ?? undefined}
          type="button"
        >Promote task</button>
        {policyReason ? <p>{policyReason}</p> : null}
        {actionStatus ? <p role="status">{actionStatus}</p> : null}
      </section>
    </section>
  );
}
