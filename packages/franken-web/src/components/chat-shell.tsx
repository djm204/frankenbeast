import { useEffect, useState } from 'react';
import brandMark from '../../../../assets/img/frankenbeast-github-logo-478x72.png';
import { useChatSession } from '../hooks/use-chat-session';
import { TranscriptPane } from './transcript-pane';
import { Composer } from './composer';
import { ActivityPane } from './activity-pane';
import { ApprovalCard } from './approval-card';
import { CostBadge } from './cost-badge';
import { NetworkPage } from '../pages/network-page';
import { NetworkApiClient, type NetworkConfigResponse, type NetworkStatusResponse } from '../lib/network-api';

export interface ChatShellProps {
  baseUrl: string;
  projectId: string;
  sessionId?: string;
  version: string;
}

type RouteId = 'chat' | 'beasts' | 'network' | 'sessions' | 'analytics' | 'costs' | 'safety' | 'settings';

const ROUTES: Array<{ id: RouteId; label: string; summary: string }> = [
  { id: 'chat', label: 'Chat', summary: 'Live CLI-parity operator console' },
  { id: 'beasts', label: 'Beasts', summary: 'Coming soon: active runs first, then finished runs by start date' },
  { id: 'network', label: 'Network', summary: 'Service controls and operator config' },
  { id: 'sessions', label: 'Sessions', summary: 'Coming online once session explorer lands' },
  { id: 'analytics', label: 'Analytics', summary: 'Usage and routing breakdowns are staged next' },
  { id: 'costs', label: 'Costs', summary: 'Token and provider reporting will live here' },
  { id: 'safety', label: 'Safety', summary: 'Approvals, policy, and injection telemetry' },
  { id: 'settings', label: 'Settings', summary: 'Operator configuration and launch profiles' },
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

export function ChatShell({ baseUrl, projectId, sessionId, version }: ChatShellProps) {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusResponse>({
    mode: 'secure',
    secureBackend: 'local-encrypted',
    services: [],
  });
  const [networkConfig, setNetworkConfig] = useState<NetworkConfigResponse>({
    network: { mode: 'secure', secureBackend: 'local-encrypted' },
    chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3000 },
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
    sessionId,
  });

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
              <p className="eyebrow">Operator Dashboard</p>
              <p className="sidebar__tagline">Dispatch, inspect, and govern active Frankenbeast runs.</p>
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
              {item.id !== 'chat' && <span className="sidebar__status">Soon</span>}
            </a>
          ))}
        </nav>

        <div className="sidebar__footer">
          <p>Frankenbeast dashboard chrome with the chat surface as the first live module.</p>
          <div className="sidebar__meta">
            <span className="version-chip">v{version}</span>
            <span>Accessibility-tuned operator shell</span>
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
