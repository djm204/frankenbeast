import { useEffect, useMemo, useState } from 'react';
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

function available<T>(section: RuntimeSection<T>): T | null {
  return section.status === 'available' ? section.data : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The smart-swarm request failed.';
}

function capabilityReason(capability: RuntimeCapability): string | null {
  return capability.status === 'unsupported' ? capability.reason : null;
}

function StateNotice({ provider, snapshot, error }: {
  provider: RuntimeProvider | undefined;
  snapshot: RuntimeSnapshot | null;
  error: unknown;
}) {
  if (error) {
    const authentication = error instanceof SmartSwarmApiError && (error.status === 401 || error.status === 403);
    return (
      <section className="smart-swarm-state smart-swarm-state--error" role="alert">
        <h2>{authentication ? 'Operator authentication required' : 'Smart-swarm unavailable'}</h2>
        <p>{authentication ? 'Authenticate this dashboard with an operator token, then retry.' : errorMessage(error)}</p>
      </section>
    );
  }
  if (!snapshot) return null;
  if (snapshot.state === 'empty') {
    return (
      <section className="smart-swarm-state">
        <h2>No runtime work in {provider?.displayName ?? snapshot.providerId}</h2>
        <p>The selected provider reported no workspaces or tasks. No demo data has been substituted.</p>
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
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [connection, setConnection] = useState<RuntimeConnectionState>('connecting');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const provider = providers.find((candidate) => candidate.id === providerId);
  const workspaces = snapshot ? available(snapshot.workspaces) ?? [] : [];
  const agents = snapshot ? available(snapshot.agents) ?? [] : [];
  const tasks = snapshot ? available(snapshot.tasks) ?? [] : [];
  const runs = snapshot ? available(snapshot.runs) ?? [] : [];
  const events = snapshot ? available(snapshot.events) ?? [] : [];
  const blockers = snapshot ? available(snapshot.blockers) ?? [] : [];
  const approvals = snapshot ? available(snapshot.approvals) ?? [] : [];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const taskNames = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void client.listProviders()
      .then((nextProviders) => {
        if (cancelled) return;
        setProviders(nextProviders);
        setProviderId((current) => (
          nextProviders.some((candidate) => candidate.id === current)
            ? current
            : nextProviders[0]?.id ?? ''
        ));
        setError(null);
        if (nextProviders.length === 0) setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    setLoading(true);
    void client.fetchSnapshot(providerId, {
      ...(workspaceId ? { workspaceId } : {}),
      activityLimit: 100,
    })
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        const nextWorkspaces = available(nextSnapshot.workspaces) ?? [];
        setWorkspaceId((current) => (
          nextWorkspaces.some((workspace) => workspace.id === current)
            ? current
            : nextWorkspaces[0]?.id ?? ''
        ));
        setSelectedTaskId((current) => (
          current && (available(nextSnapshot.tasks) ?? []).some((task) => task.id === current)
            ? current
            : null
        ));
        setError(null);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [client, providerId, workspaceId, refreshNonce]);

  useEffect(() => {
    if (!provider || !workspaceId || provider.capabilities.streaming.status !== 'supported') return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setConnection('connecting');
    void client.subscribe(provider.id, workspaceId, {
      connection: (state) => {
        if (!cancelled) setConnection(state);
      },
      error: (streamError) => {
        if (!cancelled) setError(streamError);
      },
      event: (event: RuntimeEvent) => {
        if (cancelled) return;
        setSnapshot((current) => {
          if (!current || current.events.status !== 'available') return current;
          const withoutDuplicate = current.events.data.filter((candidate) => candidate.id !== event.id);
          return {
            ...current,
            events: { status: 'available', data: [event, ...withoutDuplicate].slice(0, 100) },
          };
        });
        setRefreshNonce((current) => current + 1);
      },
    }).then((stop) => {
      if (cancelled) stop();
      else unsubscribe = stop;
    }).catch((streamError: unknown) => {
      if (!cancelled) setError(streamError);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [client, provider, workspaceId]);

  const filteredAgents = agents.filter((agent) => !workspaceId || agent.workspaceId === workspaceId);
  const filteredTasks = tasks.filter((task) => !workspaceId || task.workspaceId === workspaceId);
  const visibleTasks = filteredTasks.slice(0, MAX_VISIBLE_TASKS);
  const filteredEvents = events.filter((event) => !workspaceId || event.workspaceId === workspaceId).slice(0, 100);
  const filteredBlockers = blockers.filter((blocker) => !workspaceId || blocker.workspaceId === workspaceId);
  const filteredApprovals = approvals.filter((approval) => !workspaceId || approval.workspaceId === workspaceId);

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
                setWorkspaceId('');
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
              onChange={(event) => setWorkspaceId(event.target.value)}
              value={workspaceId}
            >
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
        </div>
        <div className="smart-swarm-connection" role="status">
          <strong>{connection === 'connected' ? 'Live · connected' : connection === 'reconnecting' ? 'Connection lost · reconnecting' : 'Connecting · connecting'}</strong>
        </div>
      </header>

      <StateNotice error={error} provider={provider} snapshot={snapshot} />
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
              <div className="smart-swarm-agents">
                {filteredAgents.map((agent) => (
                  <article className={`smart-swarm-agent smart-swarm-agent--${agent.state}`} key={agent.id}>
                    <strong>{agent.displayName}</strong>
                    <span>{String(agent.metadata?.role ?? 'agent')} · {agent.state}</span>
                  </article>
                ))}
              </div>
              <ol className="smart-swarm-tasks">
                {visibleTasks.map((task) => {
                  const parents = [...new Set([...task.parentIds, ...task.dependencyIds])]
                    .map((id) => ({ id, label: taskNames.get(id) ?? id }));
                  const currentRun = runs.find((run) => run.taskId === task.id && run.finishedAt === null);
                  return (
                    <li key={task.id}>
                      <button
                        aria-label={`Inspect ${task.title}`}
                        className="smart-swarm-task"
                        onClick={() => setSelectedTaskId(task.id)}
                        type="button"
                      >
                        <span><strong>{task.title}</strong><small>{task.state} · priority {task.priority ?? 'unset'}</small></span>
                        <span>{currentRun ? `Run ${currentRun.id}: ${currentRun.state}` : 'No current run'}</span>
                        {parents.map((parent) => <small key={parent.id}>Depends on {parent.label}</small>)}
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
                {filteredBlockers.map((blocker) => <article key={blocker.id}><strong>{blocker.category}</strong><p>{blocker.summary}</p></article>)}
              </section>
              <section className="rail-card">
                <p className="eyebrow">Approvals</p>
                <UnsupportedSection label="Approvals" section={snapshot.approvals} />
                {filteredApprovals.map((approval) => <article key={approval.id}><strong>{approval.state}</strong><p>{approval.summary}</p></article>)}
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {selectedTask && provider ? (
        <TaskDetail
          onClose={() => setSelectedTaskId(null)}
          provider={provider}
          runs={runs.filter((run) => run.taskId === selectedTask.id).slice(0, 20)}
          task={selectedTask}
        />
      ) : null}
    </main>
  );
}

function TaskDetail({ task, provider, runs, onClose }: {
  task: RuntimeTask;
  provider: RuntimeProvider;
  runs: RuntimeSnapshot['runs'] extends RuntimeSection<infer T> ? T : never;
  onClose(): void;
}) {
  const pauseReason = capabilityReason(provider.capabilities.pause);
  const resumeReason = capabilityReason(provider.capabilities.resume);
  const cancelReason = capabilityReason(provider.capabilities.cancellation);
  return (
    <section aria-label={`${task.title} details`} aria-modal="false" className="smart-swarm-detail" role="dialog">
      <header>
        <div><p className="eyebrow">Task detail</p><h3>{task.title}</h3></div>
        <button className="button button--secondary button--compact" onClick={onClose} type="button">Close</button>
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
        <button disabled={Boolean(pauseReason)} title={pauseReason ?? undefined} type="button">Pause task</button>
        {pauseReason ? <p>{pauseReason}</p> : null}
        <button disabled={Boolean(resumeReason)} title={resumeReason ?? undefined} type="button">Resume task</button>
        {resumeReason ? <p>{resumeReason}</p> : null}
        <button disabled={Boolean(cancelReason)} title={cancelReason ?? undefined} type="button">Cancel task</button>
        {cancelReason ? <p>{cancelReason}</p> : null}
      </section>
    </section>
  );
}
