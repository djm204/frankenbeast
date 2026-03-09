import { useEffect, useState } from 'react';
import brandMark from '../../../../assets/img/frankenbeast-github-logo-478x72.png';
import { useChatSession } from '../hooks/use-chat-session';
import { TranscriptPane } from './transcript-pane';
import { Composer } from './composer';
import { ActivityPane } from './activity-pane';
import { ApprovalCard } from './approval-card';
import { CostBadge } from './cost-badge';

export interface ChatShellProps {
  baseUrl: string;
  projectId: string;
  sessionId?: string;
  version: string;
}

type RouteId = 'chat' | 'sessions' | 'analytics' | 'costs' | 'safety' | 'settings';

const ROUTES: Array<{ id: RouteId; label: string; summary: string }> = [
  { id: 'chat', label: 'Chat', summary: 'Live CLI-parity operator console' },
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
    if (!window.location.hash) {
      window.location.hash = '/chat';
    }

    function handleHashChange() {
      setRoute(routeFromHash(window.location.hash));
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img src={brandMark} alt="Frankenbeast" />
          <div>
            <p className="eyebrow">Operator Dashboard</p>
            <span className="version-chip">v{version}</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Dashboard navigation">
          {ROUTES.map((item) => (
            <a
              key={item.id}
              className={`sidebar__link ${route === item.id ? 'sidebar__link--active' : ''}`}
              href={`#/${item.id}`}
            >
              <span>{item.label}</span>
              {item.id !== 'chat' && <small>Soon</small>}
            </a>
          ))}
        </nav>

        <div className="sidebar__footer">
          <p>Frankenbeast dashboard chrome with the chat surface as the first live module.</p>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar__title">
            <p className="eyebrow">Project</p>
            <h1>{activeProjectId}</h1>
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
        ) : (
          <main className="chat-page">
            <PlaceholderPage routeId={route} />
          </main>
        )}
      </div>
    </div>
  );
}
