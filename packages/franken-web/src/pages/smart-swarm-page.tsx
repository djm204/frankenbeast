import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SmartSwarmApiError,
  type RuntimeCapability,
  type RuntimeConnectionState,
  type RuntimeEvent,
  type RuntimeProvider,
  type RuntimeSection,
  type RuntimeSnapshot,
  type RuntimeTask,
  type SmartSwarmApiClient,
} from '../lib/smart-swarm-api';

interface SmartSwarmPageProps {
  client: SmartSwarmApiClient;
}

const MAX_VISIBLE_TASKS = 200;
const MAX_VISIBLE_EVIDENCE = 100;
const STREAM_REFRESH_DEBOUNCE_MS = 250;
const TOPOLOGY_REFRESH_INTERVAL_MS = 5_000;

function available<T>(section: RuntimeSection<T>): T | null {
  return section.status === 'available' ? section.data : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The smart-swarm request failed.';
}

function capabilityReason(capability: RuntimeCapability): string | null {
  return capability.status === 'unsupported' ? capability.reason : null;
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

function compareRuntimeEvidenceRecency(
  left: { id: string; occurredAt: string },
  right: { id: string; occurredAt: string },
): number {
  return Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || left.id.localeCompare(right.id);
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

export function SmartSwarmPage({ client }: SmartSwarmPageProps) {
  const [providers, setProviders] = useState<RuntimeProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceCatalog, setWorkspaceCatalog] = useState<RuntimeSnapshot['workspaces'] | null>(null);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerError, setProviderError] = useState<unknown>(null);
  const [snapshotError, setSnapshotError] = useState<unknown>(null);
  const [streamError, setStreamError] = useState<unknown>(null);
  const [connection, setConnection] = useState<RuntimeConnectionState>('connecting');
  const [refreshNonce, setRefreshNonce] = useState(0);
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

  const provider = providers.find((candidate) => candidate.id === providerId);
  const error = snapshotError ?? providerError ?? streamError;
  const workspaces = available(workspaceCatalog ?? snapshot?.workspaces ?? { status: 'available', data: [] }) ?? [];
  const agents = snapshot ? available(snapshot.agents) ?? [] : [];
  const tasks = snapshot ? available(snapshot.tasks) ?? [] : [];
  const runs = snapshot ? available(snapshot.runs) ?? [] : [];
  const events = snapshot
    ? [...(available(snapshot.events) ?? [])].sort(compareRuntimeEvidenceRecency).slice(0, MAX_VISIBLE_EVIDENCE)
    : [];
  const blockers = snapshot
    ? [...(available(snapshot.blockers) ?? [])]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
    : [];
  const approvals = snapshot
    ? [...(available(snapshot.approvals) ?? [])]
      .sort((left, right) => {
        const stateDifference = Number(right.state === 'pending') - Number(left.state === 'pending');
        if (stateDifference !== 0) return stateDifference;
        return Date.parse(right.resolvedAt ?? right.createdAt) - Date.parse(left.resolvedAt ?? left.createdAt)
          || left.id.localeCompare(right.id);
      })
    : [];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const taskNames = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);
  const newestUnfinishedRunByTask = useMemo(() => {
    const indexed = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (run.finishedAt !== null) continue;
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
          setWorkspaceCatalog(null);
          setWorkspaceId('');
          setSelectedTaskId(null);
          setSnapshotError(null);
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
    if (!providerId) return;
    let cancelled = false;
    const nextScope = `${providerId}\0${workspaceId}`;
    if (snapshotScope.current !== nextScope) {
      snapshotScope.current = nextScope;
      snapshotRequestGeneration.current += 1;
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
              : nextWorkspaces[0]?.id ?? ''
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
        setSnapshot((current) => {
          if (!current || current.events.status !== 'available') return current;
          const withoutDuplicate = current.events.data.filter((candidate) => candidate.id !== event.id);
          return {
            ...current,
            events: {
              status: 'available',
              data: [event, ...withoutDuplicate].sort(compareRuntimeEvidenceRecency).slice(0, MAX_VISIBLE_EVIDENCE),
            },
          };
        });
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
  const visibleAgents = filteredAgents.slice(0, MAX_VISIBLE_EVIDENCE);
  const filteredTasks = tasks.filter((task) => !workspaceId || task.workspaceId === workspaceId);
  const visibleTasks = [...filteredTasks]
    .sort(compareTaskActivity)
    .slice(0, MAX_VISIBLE_TASKS);
  const filteredEvents = events
    .filter((event) => !workspaceId || event.workspaceId === workspaceId)
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
          setSelectedTaskId(null);
          setWorkspaceId(catalogWorkspaces[0]?.id ?? '');
        }
      }
      setSnapshotError(null);
    } catch (nextError) {
      if (currentProviderId.current === requestedProviderId) setSnapshotError(nextError);
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
          <h2>smart-swarm</h2>
          <p>Live normalized topology and bounded operator evidence.</p>
        </div>
        <div className="smart-swarm-selectors">
          <label className="field-stack">
            <span>Runtime provider</span>
            <select
              aria-label="Runtime provider"
              className="field-control"
              onChange={(event) => {
                setSnapshot(null);
                setWorkspaceCatalog(null);
                setWorkspaceId('');
                setSelectedTaskId(null);
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
                setSelectedTaskId(null);
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
            onClick={() => setRefreshNonce((current) => current + 1)}
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
        }}
        provider={provider}
        snapshot={snapshot}
        workspaceName={workspaces.find((workspace) => workspace.id === workspaceId)?.name}
      />
      {loading ? <p className="smart-swarm-refresh" role="status">Refreshing normalized state…</p> : null}

      {snapshot ? (
        <>
          <section className="smart-swarm-capabilities rail-card" aria-label="Provider capabilities">
            <div>
              <p className="eyebrow">Runtime status</p>
              <h3>{provider?.displayName ?? snapshot.providerId}</h3>
              <p>{provider?.health.message ?? provider?.health.state ?? snapshot.state}</p>
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

          <div className="smart-swarm-layout">
            <section className="smart-swarm-topology rail-card" aria-label="Runtime topology">
              <div className="rail-card__header">
                <div><p className="eyebrow">Topology</p><h3>Tasks and agents</h3></div>
                <span>{filteredTasks.length > MAX_VISIBLE_TASKS
                  ? `Showing ${MAX_VISIBLE_TASKS} of ${filteredTasks.length} tasks`
                  : `${filteredTasks.length} tasks`}</span>
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
                          setSelectedTaskId(task.id);
                        }}
                        type="button"
                      >
                        <span><strong>{task.title}</strong><small>{task.state} · priority {task.priority ?? 'unset'}</small></span>
                        <span>{currentRun ? `Run ${currentRun.id}: ${currentRun.state}` : 'No current run'}</span>
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
                <div className="rail-card__header"><div><p className="eyebrow">Activity</p><h3>Events and logs</h3></div><span>{filteredEvents.length}</span></div>
                <UnsupportedSection label="Events" section={snapshot.events} />
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
          onClose={() => setSelectedTaskId(null)}
          provider={provider}
          returnFocus={taskDetailTrigger.current}
          runs={runs
            .filter((run) => run.taskId === selectedTask.id)
            .sort((left, right) => Date.parse(right.lastActiveAt ?? right.startedAt) - Date.parse(left.lastActiveAt ?? left.startedAt))
            .slice(0, 20)}
          task={selectedTask}
        />
      ) : null}
    </main>
  );
}

function TaskDetail({ task, provider, runs, returnFocus, onClose }: {
  task: RuntimeTask;
  provider: RuntimeProvider;
  runs: RuntimeSnapshot['runs'] extends RuntimeSection<infer T> ? T : never;
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
  const unwiredReason = 'This control is not wired to a runtime mutation yet.';
  const pauseReason = capabilityReason(provider.capabilities.pause) ?? unwiredReason;
  const resumeReason = capabilityReason(provider.capabilities.resume) ?? unwiredReason;
  const cancelReason = capabilityReason(provider.capabilities.cancellation) ?? unwiredReason;
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
          event.preventDefault();
          closeButton.current?.focus();
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
        <button disabled title={pauseReason} type="button">Pause task</button>
        {pauseReason ? <p>{pauseReason}</p> : null}
        <button disabled title={resumeReason} type="button">Resume task</button>
        {resumeReason ? <p>{resumeReason}</p> : null}
        <button disabled title={cancelReason} type="button">Cancel task</button>
        {cancelReason ? <p>{cancelReason}</p> : null}
      </section>
    </section>
  );
}
