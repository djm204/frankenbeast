import { useEffect, useMemo, useRef, useState } from 'react';
import brandMark from '../../../../assets/img/frankenbeast-github-logo-478x72.png';
import { useChatSession } from '../hooks/use-chat-session';
import { TranscriptPane } from './transcript-pane';
import { Composer } from './composer';
import { ActivityPane } from './activity-pane';
import { ApprovalCard } from './approval-card';
import { CostBadge } from './cost-badge';
import { NetworkPage } from '../pages/network-page';
import {
  BeastApiClient,
  type BeastContainerRuntimeStatus,
  type BeastCatalogEntry,
  type BeastRunDetail,
  type BeastRunSummary,
  type TrackedAgentDetail,
  type TrackedAgentInitAction,
  type TrackedAgentSummary,
} from '../lib/beast-api';
import { ChatApiClient, type ChatSessionSummary } from '../lib/api';
import { NetworkApiClient, type NetworkConfigResponse, type NetworkStatusResponse } from '../lib/network-api';
import { BeastsPage } from '../pages/beasts-page';
import { AnalyticsApiClient } from '../lib/analytics-api';
import { AnalyticsPage } from '../pages/analytics-page';

export interface ChatShellProps {
  baseUrl: string;
  beastOperatorToken?: string;
  projectId: string;
  sessionId?: string;
  version: string;
}

type RouteId = 'chat' | 'beasts' | 'network' | 'sessions' | 'analytics' | 'costs' | 'safety' | 'settings';

const ROUTES: Array<{ id: RouteId; label: string; summary: string; live: boolean }> = [
  { id: 'chat', label: 'Chat', summary: 'Live CLI-parity operator console', live: true },
  { id: 'beasts', label: 'Beasts', summary: 'Dispatch, inspect, and control tracked beast runs', live: true },
  { id: 'network', label: 'Network', summary: 'Service controls and operator config', live: true },
  { id: 'sessions', label: 'Sessions', summary: 'Coming online once session explorer lands', live: false },
  { id: 'analytics', label: 'Analytics', summary: 'Observer, governor, security, and cost telemetry', live: true },
  { id: 'costs', label: 'Costs', summary: 'Token and provider reporting will live here', live: false },
  { id: 'safety', label: 'Safety', summary: 'Approvals, policy, and injection telemetry', live: false },
  { id: 'settings', label: 'Settings', summary: 'Operator configuration and launch profiles', live: false },
];

function routeFromHash(hash: string): RouteId {
  const candidate = hash.replace(/^#\/?/, '') as RouteId;
  return ROUTES.some((route) => route.id === candidate) ? candidate : 'chat';
}

function PlaceholderPage({ routeId }: { routeId: Exclude<RouteId, 'chat'> }) {
  const route = ROUTES.find((item) => item.id === routeId)!;

  return (
    <section className="placeholder-page">
      <p className="eyebrow">Dashboard Module</p>
      <h1>{route.label}</h1>
      <p>{route.summary}</p>
      <span>Chat is the only live section in this first Frankenbeast dashboard cut.</span>
    </section>
  );
}

function appendUniqueLogLine(logs: string[], nextLine: string): string[] {
  const nextIdentity = parseLogIdentity(nextLine);
  if (nextIdentity?.eventId && logs.some((line) => parseLogIdentity(line)?.eventId === nextIdentity.eventId)) {
    return logs;
  }
  if (nextIdentity?.createdAt && logs.some((line) => {
    const identity = parseLogIdentity(line);
    return identity
      && (!identity.eventId || !nextIdentity.eventId)
      && identity.stream === nextIdentity.stream
      && identity.message === nextIdentity.message
      && identity.createdAt === nextIdentity.createdAt;
  })) {
    return logs;
  }
  return logs[logs.length - 1] === nextLine ? logs : [...logs, nextLine];
}

function parseLogIdentity(line: string): { eventId?: string; stream?: string; message?: string; createdAt?: string } | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as { eventId?: unknown; stream?: unknown; message?: unknown; createdAt?: unknown };
    const identity = {
      ...(typeof candidate.eventId === 'string' && candidate.eventId.length > 0 ? { eventId: candidate.eventId } : {}),
      ...(typeof candidate.stream === 'string' ? { stream: candidate.stream } : {}),
      ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
      ...(typeof candidate.createdAt === 'string' ? { createdAt: candidate.createdAt } : {}),
    };
    return identity.eventId || (identity.message && identity.createdAt) ? identity : null;
  } catch {
    return null;
  }
}

function getAgentEventRunId(payload: unknown): string | null {
  return typeof payload === 'object'
    && payload !== null
    && 'runId' in payload
    && typeof (payload as { runId?: unknown }).runId === 'string'
    ? (payload as { runId: string }).runId
    : null;
}

function formatStreamedLogLine(event: { eventId?: string; stream?: string; line: string; createdAt?: string }): string {
  if (event.eventId || event.createdAt || event.stream) {
    return JSON.stringify({
      ...(event.eventId ? { eventId: event.eventId } : {}),
      ...(event.stream ? { stream: event.stream } : {}),
      message: event.line,
      ...(event.createdAt ? { createdAt: event.createdAt } : {}),
    });
  }
  return event.line;
}

function buildInitAction(
  definitionId: string,
  config: Record<string, unknown>,
  chatSessionId: string | undefined,
): TrackedAgentInitAction {
  if (definitionId === 'design-interview') {
    return {
      kind: 'design-interview',
      command: '/interview',
      config,
      ...(chatSessionId ? { chatSessionId } : {}),
    };
  }

  if (definitionId === 'chunk-plan') {
    return {
      kind: 'chunk-plan',
      command: `/plan --design-doc ${String(config.designDocPath ?? '')}`,
      config,
      ...(chatSessionId ? { chatSessionId } : {}),
    };
  }

  return {
    kind: 'martin-loop',
    command: 'martin-loop',
    config,
  };
}

export function ChatShell({ baseUrl, beastOperatorToken, projectId, sessionId, version }: ChatShellProps) {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(sessionId);
  const [sessionSeed, setSessionSeed] = useState(0);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [beastCatalog, setBeastCatalog] = useState<BeastCatalogEntry[]>([]);
  const [beastAgents, setBeastAgents] = useState<TrackedAgentSummary[]>([]);
  const [beastRuns, setBeastRuns] = useState<BeastRunSummary[]>([]);
  const [beastContainerRuntime, setBeastContainerRuntime] = useState<BeastContainerRuntimeStatus | undefined>(undefined);
  const [selectedBeastAgentId, setSelectedBeastAgentId] = useState<string | null>(null);
  const [beastAgentDetail, setBeastAgentDetail] = useState<(TrackedAgentDetail & { run?: BeastRunDetail | null }) | null>(null);
  const beastAgentsRef = useRef<TrackedAgentSummary[]>([]);
  const beastAgentDetailRef = useRef<(TrackedAgentDetail & { run?: BeastRunDetail | null }) | null>(null);
  const [beastError, setBeastError] = useState<string | null>(null);
  const [beastRefreshNonce, setBeastRefreshNonce] = useState(0);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusResponse>({
    mode: 'secure',
    secureBackend: 'local-encrypted',
    services: [],
  });
  const [networkConfig, setNetworkConfig] = useState<NetworkConfigResponse>({
    network: { mode: 'secure', secureBackend: 'local-encrypted' },
    chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
  });
  const [networkLogs, setNetworkLogs] = useState<string[]>([]);
  const {
    activity,
    approve,
    connectionStatus,
    costUsd,
    messages,
    pendingApproval,
    projectId: activeProjectId,
    send,
    sessionId: activeSessionId,
    showTypingIndicator,
    status,
    tier,
    tokenTotals,
  } = useChatSession({
    baseUrl,
    operatorToken: beastOperatorToken,
    projectId,
    sessionId: selectedSessionId,
    sessionSeed,
  });

  const chatClient = useMemo(
    () => new ChatApiClient(baseUrl, beastOperatorToken),
    [baseUrl, beastOperatorToken],
  );
  const analyticsClient = useMemo(
    () => new AnalyticsApiClient(baseUrl, beastOperatorToken),
    [baseUrl, beastOperatorToken],
  );
  const beastClient = useMemo(
    () => (beastOperatorToken ? new BeastApiClient(baseUrl, beastOperatorToken) : null),
    [baseUrl, beastOperatorToken],
  );

  useEffect(() => {
    const client = new NetworkApiClient(baseUrl, beastOperatorToken);
    void Promise.allSettled([client.getStatus(), client.getConfig()]).then(([statusResult, configResult]) => {
      if (statusResult.status === 'fulfilled') {
        setNetworkStatus(statusResult.value);
      }
      if (configResult.status === 'fulfilled') {
        setNetworkConfig(configResult.value);
      }
    });
  }, [baseUrl, beastOperatorToken]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    setSelectedSessionId(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    let cancelled = false;
    void chatClient.listSessions(projectId)
      .then((sessions) => {
        if (!cancelled) {
          setChatSessions(sessions);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatSessions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatClient, projectId, activeSessionId, sessionSeed]);

  useEffect(() => {
    beastAgentsRef.current = beastAgents;
  }, [beastAgents]);

  useEffect(() => {
    beastAgentDetailRef.current = beastAgentDetail;
  }, [beastAgentDetail]);

  useEffect(() => {
    if (route !== 'beasts') {
      return;
    }
    if (!beastClient) {
      setBeastError('Set VITE_BEAST_OPERATOR_TOKEN to use the secure Beast control API.');
      setBeastCatalog([]);
      setBeastAgents([]);
      setBeastRuns([]);
      setBeastContainerRuntime(undefined);
      setBeastAgentDetail(null);
      return;
    }
    const client = beastClient;

    let cancelled = false;

    async function refreshBeasts() {
      try {
        const [catalog, agents, runs, containerRuntime] = await Promise.all([
          client.getCatalog(),
          client.listAgents(),
          client.listRuns(),
          client.getContainerRuntimeStatus().catch((error) => ({
            available: false,
            reason: error instanceof Error ? error.message : 'Container runtime status unavailable.',
          })),
        ]);
        if (cancelled) {
          return;
        }
        setBeastError(null);
        setBeastCatalog(catalog);
        setBeastAgents(agents);
        setBeastRuns(runs);
        setBeastContainerRuntime(containerRuntime);
        const currentAgentId = selectedBeastAgentId ?? agents[0]?.id ?? null;
        setSelectedBeastAgentId(currentAgentId);

        if (currentAgentId) {
          const detail = await client.getAgent(currentAgentId);
          if (!cancelled) {
            if (detail.agent.dispatchRunId) {
              const [run, logs] = await Promise.all([
                client.getRun(detail.agent.dispatchRunId),
                client.getLogs(detail.agent.dispatchRunId),
              ]);
              if (!cancelled) {
                setBeastAgentDetail({ ...detail, run: { ...run, logs } });
              }
            } else {
              setBeastAgentDetail({ ...detail, run: null });
            }
          }
        } else {
          setBeastAgentDetail(null);
        }
      } catch (error) {
        if (!cancelled) {
          setBeastError(error instanceof Error ? error.message : 'Unable to load Beast dispatch state.');
        }
      }
    }

    void refreshBeasts();

    return () => {
      cancelled = true;
    };
  }, [route, beastClient, selectedBeastAgentId, beastRefreshNonce]);

  useEffect(() => {
    if (route !== 'beasts' || !beastClient) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const requestBeastRefresh = () => setBeastRefreshNonce((current) => current + 1);

    void beastClient.subscribeToEvents({
      snapshot: (snapshot) => {
        if (cancelled || !snapshot.agents) return;
        const currentAgents = beastAgentsRef.current;
        const currentDetail = beastAgentDetailRef.current;
        const sawUnknownAgent = snapshot.agents.some((candidate) => !currentAgents.some((agent) => agent.id === candidate.id));
        const selectedSnapshotAgent = currentDetail
          ? snapshot.agents.find((candidate) => candidate.id === currentDetail.agent.id)
          : undefined;
        const selectedAgentLinkedRun = Boolean(currentDetail && !currentDetail.run && selectedSnapshotAgent?.dispatchRunId);
        setBeastAgents((current) => {
          return current.map((agent) => {
            const next = snapshot.agents?.find((candidate) => candidate.id === agent.id);
            return next ? { ...agent, ...next } : agent;
          });
        });
        setBeastAgentDetail((current) => {
          if (!current) return current;
          const next = snapshot.agents?.find((candidate) => candidate.id === current.agent.id);
          return next ? { ...current, agent: { ...current.agent, ...next } } : current;
        });
        if (sawUnknownAgent || selectedAgentLinkedRun) requestBeastRefresh();
      },
      agentStatus: (event) => {
        if (cancelled) return;
        const sawKnownAgent = beastAgentsRef.current.some((agent) => agent.id === event.agentId);
        setBeastAgents((current) => current.map((agent) => {
          if (agent.id !== event.agentId) return agent;
          return { ...agent, status: event.status, ...(event.updatedAt ? { updatedAt: event.updatedAt } : {}) };
        }));
        setBeastAgentDetail((current) => (current?.agent.id === event.agentId
          ? {
              ...current,
              agent: {
                ...current.agent,
                status: event.status,
                ...(event.updatedAt ? { updatedAt: event.updatedAt } : {}),
              },
            }
          : current));
        if (!sawKnownAgent) requestBeastRefresh();
        setBeastError(null);
      },
      agentEvent: (event) => {
        if (cancelled) return;
        const currentDetail = beastAgentDetailRef.current;
        const sawSelectedAgent = currentDetail?.agent.id === event.agentId;
        const linkedRunId = getAgentEventRunId(event.event.payload);
        const selectedAgentLinkedRun = Boolean(
          sawSelectedAgent
          && linkedRunId
          && currentDetail
          && currentDetail.agent.dispatchRunId !== linkedRunId
          && currentDetail.run?.run.id !== linkedRunId,
        );
        if (selectedAgentLinkedRun && currentDetail && linkedRunId) {
          beastAgentDetailRef.current = {
            ...currentDetail,
            agent: { ...currentDetail.agent, dispatchRunId: linkedRunId },
          };
        }
        setBeastAgentDetail((current) => {
          if (!current || current.agent.id !== event.agentId) return current;
          const nextEvent = {
            id: event.event.id ?? `stream-${event.agentId}-${event.event.createdAt ?? Date.now()}`,
            agentId: event.agentId,
            sequence: event.event.sequence ?? current.events.length + 1,
            level: event.event.level ?? 'info',
            type: event.event.type ?? 'agent.event',
            message: event.event.message ?? '',
            payload: event.event.payload ?? {},
            createdAt: event.event.createdAt ?? new Date().toISOString(),
          };
          if (current.events.some((existing) => existing.id === nextEvent.id)) return current;
          return {
            ...current,
            agent: linkedRunId ? { ...current.agent, dispatchRunId: linkedRunId } : current.agent,
            events: [...current.events, nextEvent],
          };
        });
        if (!sawSelectedAgent || selectedAgentLinkedRun) requestBeastRefresh();
      },
      runStatus: (event) => {
        if (cancelled) return;
        const currentDetail = beastAgentDetailRef.current;
        const shouldRefreshRun = Boolean(
          currentDetail
          && (!currentDetail.run || currentDetail.run.run.id !== event.runId)
          && currentDetail.agent.dispatchRunId === event.runId,
        );
        setBeastAgentDetail((current) => {
          if (!current?.run || current.run.run.id !== event.runId) {
            return current;
          }
          return {
            ...current,
            run: {
              ...current.run,
              run: {
                ...current.run.run,
                status: event.status,
              },
            },
          };
        });
        if (shouldRefreshRun) requestBeastRefresh();
      },
      runLog: (event) => {
        if (cancelled) return;
        const currentDetail = beastAgentDetailRef.current;
        const shouldRefreshRun = Boolean(
          currentDetail
          && (!currentDetail.run || currentDetail.run.run.id !== event.runId)
          && currentDetail.agent.dispatchRunId === event.runId,
        );
        setBeastAgentDetail((current) => {
          if (!current?.run || current.run.run.id !== event.runId) {
            return current;
          }
          return {
            ...current,
            run: {
              ...current.run,
              logs: appendUniqueLogLine(current.run.logs, formatStreamedLogLine(event)),
            },
          };
        });
        if (shouldRefreshRun) requestBeastRefresh();
      },
      error: (error) => {
        if (!cancelled) {
          setBeastError(error.message);
        }
      },
    }).then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setBeastError(error instanceof Error ? error.message : 'Unable to subscribe to Beast events.');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [route, beastClient]);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = '/chat';
    }

    function handleHashChange() {
      setRoute(routeFromHash(window.location.hash));
      setIsSidebarOpen(false);
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeRoute = ROUTES.find((item) => item.id === route) ?? ROUTES[0]!;

  return (
    <div className={`dashboard-shell ${isSidebarOpen ? 'dashboard-shell--nav-open' : ''}`}>
      <button
        aria-hidden={!isSidebarOpen}
        aria-label="Close navigation overlay"
        className={`sidebar-backdrop ${isSidebarOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        tabIndex={isSidebarOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-label="Primary"
        className={`sidebar ${isSidebarOpen ? 'sidebar--open' : ''}`}
        id="dashboard-sidebar"
      >
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <img src={brandMark} alt="Frankenbeast" />
            <div>
              <span className="eyebrow">Frankenbeast</span> - <span className="sidebar__tagline">Release the Beast.</span>
            </div>
          </div>

          <button
            aria-label="Close navigation menu"
            className="button button--secondary button--compact sidebar__close"
            onClick={() => setIsSidebarOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Dashboard navigation">
          {ROUTES.map((item) => (
            <a
              aria-current={route === item.id ? 'page' : undefined}
              key={item.id}
              className={`sidebar__link ${route === item.id ? 'sidebar__link--active' : ''}`}
              href={`#/${item.id}`}
            >
              <span className="sidebar__linkText">
                <strong>{item.label}</strong>
                <small>{item.summary}</small>
              </span>
              {!item.live && <span className="sidebar__status">Soon</span>}
            </a>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__meta">
            <span className="version-chip">v{version}</span>
          </div>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar__identity">
            <button
              aria-controls="dashboard-sidebar"
              aria-expanded={isSidebarOpen ? 'true' : 'false'}
              aria-label="Open navigation menu"
              className="button button--secondary button--compact sidebar__toggle"
              onClick={() => setIsSidebarOpen(true)}
              type="button"
            >
              Menu
            </button>

            <div className="topbar__title">
              <p className="eyebrow">Project</p>
              <h1>{activeProjectId}</h1>
              <p className="topbar__summary">
                <span>{activeRoute.label}</span>
                <span>{activeRoute.summary}</span>
              </p>
            </div>
          </div>

          <dl className="topbar__stats">
            <div>
              <dt>Session</dt>
              <dd>{activeSessionId ?? 'booting'}</dd>
            </div>
            <div>
              <dt>Socket</dt>
              <dd>{connectionStatus}</dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd>{tier ?? 'pending'}</dd>
            </div>
            <div>
              <dt>Spend</dt>
              <dd>${costUsd.toFixed(2)}</dd>
            </div>
          </dl>
        </header>

        {route === 'chat' ? (
          <main className="chat-page">
            <section className="chat-page__main">
              <section className="session-switcher rail-card">
                <div className="session-switcher__copy">
                  <p className="eyebrow">Conversations</p>
                  <h2>Resume a chat or start fresh</h2>
                </div>
                <div className="session-switcher__controls">
                  <label className="field-stack">
                    <span>Conversation</span>
                    <select
                      aria-label="Conversation"
                      className="field-control"
                      onChange={(event) => {
                        const nextId = event.target.value.trim();
                        setSelectedSessionId(nextId || undefined);
                      }}
                      value={selectedSessionId ?? ''}
                    >
                      <option value="">Current conversation</option>
                      {chatSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.preview ? `${session.id} · ${session.preview}` : session.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button--secondary"
                    onClick={() => {
                      setSelectedSessionId(undefined);
                      setSessionSeed((current) => current + 1);
                    }}
                    type="button"
                  >
                    New conversation
                  </button>
                </div>
              </section>

              <TranscriptPane messages={messages} showTypingIndicator={showTypingIndicator} />
              <Composer
                connectionStatus={connectionStatus}
                disabled={status === 'connecting' || status === 'sending' || status === 'streaming'}
                onSend={(content) => {
                  void send(content);
                }}
                status={status}
              />
            </section>

            <aside className="chat-page__rail">
              <CostBadge tier={tier ?? 'pending'} tokenTotals={tokenTotals} costUsd={costUsd} />
              <ActivityPane events={activity} />
              <ApprovalCard
                pending={Boolean(pendingApproval)}
                description={pendingApproval?.description ?? ''}
                onApprove={() => {
                  void approve(true);
                }}
                onReject={() => {
                  void approve(false);
                }}
              />
            </aside>
          </main>
        ) : route === 'beasts' ? (
          <BeastsPage
            agents={beastAgents}
            agentDetail={beastAgentDetail}
            catalog={beastCatalog}
            runs={beastRuns}
            containerRuntime={beastContainerRuntime}
            disabled={!beastClient}
            error={beastError}
            logs={beastAgentDetail?.run?.logs ?? []}
            selectedAgentId={selectedBeastAgentId}
            onClose={() => {
              setSelectedBeastAgentId(null);
              setBeastAgentDetail(null);
            }}
            onLaunch={async (config) => {
              if (!beastClient) throw new Error('Beast API not available. Check VITE_BEAST_OPERATOR_TOKEN.');
              const workflow = config.workflow as Record<string, unknown> | undefined;
              const definitionId = String(workflow?.workflowType ?? 'martin-loop');
              const executionMode = config.executionMode === 'container' ? 'container' : 'process';
              const initAction = buildInitAction(definitionId, config, selectedSessionId);
              await beastClient.createAgent({ definitionId, initAction, initConfig: config, executionMode });
              setBeastRefreshNonce((current) => current + 1);
            }}
            onDelete={(agentId) => {
              if (!beastClient) return;
              void beastClient.deleteAgent(agentId).then(() => {
                setSelectedBeastAgentId((current) => current === agentId ? null : current);
                setBeastRefreshNonce((current) => current + 1);
              }).catch((err) => {
                setBeastError(err instanceof Error ? err.message : 'Unable to delete tracked agent.');
              });
            }}
            onKill={(agentId) => {
              if (!beastClient) return;
              void beastClient.killAgent(agentId).then(() => {
                setBeastRefreshNonce((current) => current + 1);
              }).catch((err) => {
                setBeastError(err instanceof Error ? err.message : 'Unable to kill tracked agent.');
              });
            }}
            onRestart={(agentId) => {
              if (!beastClient) return;
              void beastClient.restartAgent(agentId).then(() => {
                setBeastRefreshNonce((current) => current + 1);
              }).catch((err) => {
                setBeastError(err instanceof Error ? err.message : 'Unable to restart tracked agent.');
              });
            }}
            onResume={(agentId) => {
              if (!beastClient) return;
              void beastClient.resumeAgent(agentId).then(() => {
                setBeastRefreshNonce((current) => current + 1);
              }).catch((err) => {
                setBeastError(err instanceof Error ? err.message : 'Unable to resume tracked agent.');
              });
            }}
            onSelectAgent={(agentId) => {
              setSelectedBeastAgentId(agentId);
            }}
            onStart={(agentId) => {
              if (!beastClient) return;
              void beastClient.startAgent(agentId).then(() => {
                setBeastRefreshNonce((current) => current + 1);
              }).catch((err) => {
                setBeastError(err instanceof Error ? err.message : 'Unable to start tracked agent.');
              });
            }}
            onStop={(agentId) => {
              if (!beastClient) return;
              void beastClient.stopAgent(agentId).then(() => {
                setBeastRefreshNonce((current) => current + 1);
              }).catch((err) => {
                setBeastError(err instanceof Error ? err.message : 'Unable to stop tracked agent.');
              });
            }}
          />
        ) : route === 'network' ? (
          <NetworkPage
            config={networkConfig}
            logs={networkLogs}
            onRefresh={() => {
              const client = new NetworkApiClient(baseUrl, beastOperatorToken);
              void client.getStatus().then(setNetworkStatus).catch(() => undefined);
            }}
            onRestart={(serviceId) => {
              const client = new NetworkApiClient(baseUrl, beastOperatorToken);
              void client.restart(serviceId).then(() => client.getStatus()).then(setNetworkStatus).catch(() => undefined);
            }}
            onSaveConfig={(assignments) => {
              const client = new NetworkApiClient(baseUrl, beastOperatorToken);
              void client.updateConfig(assignments).then(setNetworkConfig).catch(() => undefined);
            }}
            onStart={(serviceId) => {
              const client = new NetworkApiClient(baseUrl, beastOperatorToken);
              void client.start(serviceId).then(() => client.getStatus()).then(setNetworkStatus).catch(() => undefined);
            }}
            onStop={(serviceId) => {
              const client = new NetworkApiClient(baseUrl, beastOperatorToken);
              void client.stop(serviceId).then(() => client.getStatus()).then(setNetworkStatus).catch(() => undefined);
            }}
            services={networkStatus.services}
            status={networkStatus}
          />
        ) : route === 'analytics' ? (
          <AnalyticsPage client={analyticsClient} />
        ) : (
          <main className="chat-page">
            <PlaceholderPage routeId={route} />
          </main>
        )}
      </div>
    </div>
  );
}
