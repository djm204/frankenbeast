import { useEffect, useMemo, useState } from 'react';
import brandMark from '../../../../assets/img/frankenbeast-github-logo-478x72.png';
import { useChatSession } from '../hooks/use-chat-session';
import { TranscriptPane } from './transcript-pane';
import { Composer } from './composer';
import { ActivityPane } from './activity-pane';
import { ApprovalCard } from './approval-card';
import { CostBadge } from './cost-badge';
import { NetworkPage } from '../pages/network-page';
import { BeastApiClient, type BeastCatalogEntry, type BeastRunDetail, type BeastRunSummary } from '../lib/beast-api';
import { ChatApiClient, type ChatSessionSummary } from '../lib/api';
import { NetworkApiClient, type NetworkConfigResponse, type NetworkStatusResponse } from '../lib/network-api';
import { BeastDispatchPage } from '../pages/beast-dispatch-page';

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
  { id: 'analytics', label: 'Analytics', summary: 'Usage and routing breakdowns are staged next', live: false },
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

export function ChatShell({ baseUrl, beastOperatorToken, projectId, sessionId, version }: ChatShellProps) {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(sessionId);
  const [sessionSeed, setSessionSeed] = useState(0);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [beastCatalog, setBeastCatalog] = useState<BeastCatalogEntry[]>([]);
  const [beastRuns, setBeastRuns] = useState<BeastRunSummary[]>([]);
  const [selectedBeastRunId, setSelectedBeastRunId] = useState<string | null>(null);
  const [beastRunDetail, setBeastRunDetail] = useState<BeastRunDetail | null>(null);
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
    projectId,
    sessionId: selectedSessionId,
    sessionSeed,
  });

  const chatClient = useMemo(() => new ChatApiClient(baseUrl), [baseUrl]);
  const beastClient = useMemo(
    () => (beastOperatorToken ? new BeastApiClient(baseUrl, beastOperatorToken) : null),
    [baseUrl, beastOperatorToken],
  );

  useEffect(() => {
    const client = new NetworkApiClient(baseUrl);
    void Promise.allSettled([client.getStatus(), client.getConfig()]).then(([statusResult, configResult]) => {
      if (statusResult.status === 'fulfilled') {
        setNetworkStatus(statusResult.value);
      }
      if (configResult.status === 'fulfilled') {
        setNetworkConfig(configResult.value);
      }
    });
  }, [baseUrl]);

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
    if (route !== 'beasts') {
      return;
    }
    if (!beastClient) {
      setBeastError('Set VITE_BEAST_OPERATOR_TOKEN to use the secure Beast control API.');
      setBeastCatalog([]);
      setBeastRuns([]);
      setBeastRunDetail(null);
      return;
    }
    const client = beastClient;

    let cancelled = false;

    async function refreshBeasts() {
      try {
        const [catalog, runs] = await Promise.all([
          client.getCatalog(),
          client.listRuns(),
        ]);
        if (cancelled) {
          return;
        }
        setBeastError(null);
        setBeastCatalog(catalog);
        setBeastRuns(runs);
        const currentRunId = selectedBeastRunId ?? runs[0]?.id ?? null;
        setSelectedBeastRunId(currentRunId);

        if (currentRunId) {
          const [detail, logs] = await Promise.all([
            client.getRun(currentRunId),
            client.getLogs(currentRunId),
          ]);
          if (!cancelled) {
            setBeastRunDetail({ ...detail, logs });
          }
        } else {
          setBeastRunDetail(null);
        }
      } catch (error) {
        if (!cancelled) {
          setBeastError(error instanceof Error ? error.message : 'Unable to load Beast dispatch state.');
        }
      }
    }

    void refreshBeasts();
    const interval = window.setInterval(() => {
      void refreshBeasts();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [route, beastClient, selectedBeastRunId, beastRefreshNonce]);

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
          <BeastDispatchPage
            catalog={beastCatalog}
            disabled={!beastClient}
            error={beastError}
            onDispatch={(definitionId, config) => {
              if (!beastClient) {
                return;
              }
              void beastClient.createRun({
                definitionId,
                config,
                startNow: true,
              }).then((run) => {
                setSelectedBeastRunId(run.id);
                setBeastRefreshNonce((current) => current + 1);
              }).catch((error) => {
                setBeastError(error instanceof Error ? error.message : 'Unable to dispatch Beast run.');
              });
            }}
            onKill={(runId) => {
              if (!beastClient) {
                return;
              }
              void beastClient.killRun(runId).then(() => {
                setSelectedBeastRunId(runId);
                setBeastRefreshNonce((current) => current + 1);
              }).catch((error) => {
                setBeastError(error instanceof Error ? error.message : 'Unable to kill Beast run.');
              });
            }}
            onRefresh={() => {
              setBeastRefreshNonce((current) => current + 1);
            }}
            onRestart={(runId) => {
              if (!beastClient) {
                return;
              }
              void beastClient.restartRun(runId).then(() => {
                setSelectedBeastRunId(runId);
                setBeastRefreshNonce((current) => current + 1);
              }).catch((error) => {
                setBeastError(error instanceof Error ? error.message : 'Unable to restart Beast run.');
              });
            }}
            onSelectRun={(runId) => {
              setSelectedBeastRunId(runId);
            }}
            onStart={(runId) => {
              if (!beastClient) {
                return;
              }
              void beastClient.startRun(runId).then(() => {
                setSelectedBeastRunId(runId);
                setBeastRefreshNonce((current) => current + 1);
              }).catch((error) => {
                setBeastError(error instanceof Error ? error.message : 'Unable to start Beast run.');
              });
            }}
            onStop={(runId) => {
              if (!beastClient) {
                return;
              }
              void beastClient.stopRun(runId).then(() => {
                setSelectedBeastRunId(runId);
                setBeastRefreshNonce((current) => current + 1);
              }).catch((error) => {
                setBeastError(error instanceof Error ? error.message : 'Unable to stop Beast run.');
              });
            }}
            runDetail={beastRunDetail}
            runs={beastRuns}
            selectedRunId={selectedBeastRunId}
          />
        ) : route === 'network' ? (
          <NetworkPage
            config={networkConfig}
            logs={networkLogs}
            onRefresh={() => {
              const client = new NetworkApiClient(baseUrl);
              void client.getStatus().then(setNetworkStatus).catch(() => undefined);
            }}
            onRestart={(serviceId) => {
              const client = new NetworkApiClient(baseUrl);
              void client.restart(serviceId).then(() => client.getStatus()).then(setNetworkStatus).catch(() => undefined);
            }}
            onSaveConfig={(assignments) => {
              const client = new NetworkApiClient(baseUrl);
              void client.updateConfig(assignments).then(setNetworkConfig).catch(() => undefined);
            }}
            onStart={(serviceId) => {
              const client = new NetworkApiClient(baseUrl);
              void client.start(serviceId).then(() => client.getStatus()).then(setNetworkStatus).catch(() => undefined);
            }}
            onStop={(serviceId) => {
              const client = new NetworkApiClient(baseUrl);
              void client.stop(serviceId).then(() => client.getStatus()).then(setNetworkStatus).catch(() => undefined);
            }}
            services={networkStatus.services}
            status={networkStatus}
          />
        ) : (
          <main className="chat-page">
            <PlaceholderPage routeId={route} />
          </main>
        )}
      </div>
    </div>
  );
}
