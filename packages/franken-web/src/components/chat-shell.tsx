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
  BeastApiError,
  type BeastContainerRuntimeStatus,
  type BeastCatalogEntry,
  type BeastRunDetail,
  type BeastRunSummary,
  type ModuleConfig,
  type TrackedAgentDetail,
  type TrackedAgentInitAction,
  type TrackedAgentSummary,
} from '../lib/beast-api';
import { ChatApiClient, type ChatSessionSummary, type CorruptChatSessionFile } from '../lib/api';
import { NetworkApiClient, type NetworkConfigResponse, type NetworkStatusResponse } from '../lib/network-api';
import { BeastsPage } from '../pages/beasts-page';
import type { AgentLifecycleAction } from './beasts/agent-action-bar';
import { AnalyticsApiClient } from '../lib/analytics-api';
import { AnalyticsPage } from '../pages/analytics-page';
import { DashboardApiClient } from '../lib/dashboard-api';
import { DashboardPage } from '../pages/dashboard-page';
import { ChatErrorBanners } from './chat-shell/chat-error-banners';
import { PlaceholderPage } from './chat-shell/placeholder-page';
import { PRIMARY_NAV_ROUTES, ROUTES, routeFromHash, type RouteId } from './chat-shell/route-model';
import { formatSessionOptionLabel } from './chat-shell/session-labels';
import { getSidebarFocusableElements } from './chat-shell/sidebar-focus';
import { appendUniqueLogLine, formatStreamedLogLine, getAgentEventRunId } from './chat-shell/beast-log-utils';
import { networkErrorMessage } from './chat-shell/network-error';

export interface ChatShellProps {
  baseUrl: string;
  projectId: string;
  sessionId?: string;
  version: string;
}

export function buildInitAction(
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
    const workflow = config.workflow as Record<string, unknown> | undefined;
    const designDocPath = typeof config.designDocPath === 'string'
      ? config.designDocPath
      : typeof workflow?.designDocPath === 'string'
        ? workflow.designDocPath
        : typeof workflow?.docPath === 'string'
          ? workflow.docPath
          : '';

    return {
      kind: 'chunk-plan',
      command: `/plan --design-doc ${designDocPath}`,
      config,
      ...(chatSessionId ? { chatSessionId } : {}),
    };
  }

  if (definitionId === 'martin-loop') {
    return {
      kind: 'martin-loop',
      command: 'martin-loop',
      config,
      ...(chatSessionId ? { chatSessionId } : {}),
    };
  }

  throw new Error(`Unsupported Beast workflow definition: ${definitionId}`);
}

export function resolveWizardDefinitionId(config: Record<string, unknown>): string {
  const workflow = config.workflow as Record<string, unknown> | undefined;
  const workflowType = workflow?.workflowType;
  if (typeof workflowType !== 'string' || workflowType.trim().length === 0) {
    throw new Error('Workflow type is required before launching a Beast agent.');
  }
  return workflowType.trim();
}

export function ChatShell({ baseUrl, projectId, sessionId, version }: ChatShellProps) {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash));
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileSidebar, setIsMobileSidebar] = useState(() => window.matchMedia?.('(max-width: 920px)').matches ?? false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const wasSidebarOpenRef = useRef(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(sessionId);
  const [sessionSeed, setSessionSeed] = useState(0);
  const [preserveComposerDraft, setPreserveComposerDraft] = useState(!sessionId);
  const [clearedFailedDraft, setClearedFailedDraft] = useState<{ content: string; nonce: number } | undefined>(undefined);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [corruptChatSessions, setCorruptChatSessions] = useState<CorruptChatSessionFile[]>([]);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(true);
  const [chatSessionsError, setChatSessionsError] = useState<string | null>(null);
  const [chatSessionsRefreshNonce, setChatSessionsRefreshNonce] = useState(0);
  const [beastCatalog, setBeastCatalog] = useState<BeastCatalogEntry[]>([]);
  const [beastAgents, setBeastAgents] = useState<TrackedAgentSummary[]>([]);
  const [beastRuns, setBeastRuns] = useState<BeastRunSummary[]>([]);
  const [beastContainerRuntime, setBeastContainerRuntime] = useState<BeastContainerRuntimeStatus | undefined>(undefined);
  const [selectedBeastAgentId, setSelectedBeastAgentId] = useState<string | null>(null);
  const [beastAgentDetail, setBeastAgentDetail] = useState<(TrackedAgentDetail & { run?: BeastRunDetail | null }) | null>(null);
  const beastAgentsRef = useRef<TrackedAgentSummary[]>([]);
  const beastAgentDetailRef = useRef<(TrackedAgentDetail & { run?: BeastRunDetail | null }) | null>(null);
  const [beastError, setBeastError] = useState<string | null>(null);
  const beastStreamErrorRef = useRef<string | null>(null);
  const [beastCreationUnavailableReason, setBeastCreationUnavailableReason] = useState<string | null>(null);
  const [beastRefreshNonce, setBeastRefreshNonce] = useState(0);
  const [pendingBeastAgentActions, setPendingBeastAgentActions] = useState<Record<string, AgentLifecycleAction | undefined>>({});
  const pendingBeastAgentActionsRef = useRef<Record<string, AgentLifecycleAction | undefined>>({});
  const selectedBeastAgentIdRef = useRef<string | null>(null);
  const shouldAutoSelectBeastAgentRef = useRef(true);
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
  const [selectedNetworkLogServiceId, setSelectedNetworkLogServiceId] = useState<string | undefined>(undefined);
  const [networkLogsLoading, setNetworkLogsLoading] = useState(false);
  const [networkLogsError, setNetworkLogsError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [networkConfigError, setNetworkConfigError] = useState<string | null>(null);
  const networkStatusRequestIdRef = useRef(0);
  const networkStatusSuccessRequestIdRef = useRef(0);
  const networkStatusSettledRequestIdRef = useRef(0);
  const networkConfigRequestIdRef = useRef(0);
  const networkLogsRequestIdRef = useRef(0);
  const {
    activity,
    approve,
    approvalError,
    approvalResolving,
    clearedFailedDraft: reconciledFailedDraft,
    connectionStatus,
    costUsd,
    costTelemetryStatus,
    dismissError,
    errorBanners,
    messages,
    pendingApproval,
    projectId: activeProjectId,
    reconnect,
    retryError,
    retryMessage,
    send,
    sessionId: activeSessionId,
    sessionState,
    showTypingIndicator,
    status,
    tier,
    tokenTelemetryStatus,
    tokenTotals,
  } = useChatSession({
    baseUrl,
    projectId,
    sessionId: selectedSessionId,
    sessionSeed,
  });

  useEffect(() => {
    if (reconciledFailedDraft) {
      setClearedFailedDraft((current) => ({
        content: reconciledFailedDraft.content,
        nonce: (current?.nonce ?? 0) + 1,
      }));
    }
  }, [reconciledFailedDraft]);

  const chatClient = useMemo(
    () => new ChatApiClient(baseUrl),
    [baseUrl],
  );
  const analyticsClient = useMemo(
    () => new AnalyticsApiClient(baseUrl),
    [baseUrl],
  );
  const dashboardClient = useMemo(
    () => new DashboardApiClient(baseUrl),
    [baseUrl],
  );
  const beastClient = useMemo(
    () => new BeastApiClient(baseUrl),
    [baseUrl],
  );

  useEffect(() => {
    const client = new NetworkApiClient(baseUrl);
    const statusRequestId = ++networkStatusRequestIdRef.current;
    void client.getStatus()
      .then((nextStatus) => {
        if (statusRequestId === networkStatusRequestIdRef.current) {
          setNetworkStatus(nextStatus);
          networkStatusSuccessRequestIdRef.current = statusRequestId;
          networkStatusSettledRequestIdRef.current = statusRequestId;
          setNetworkError(null);
        }
      })
      .catch((error: unknown) => {
        if (statusRequestId === networkStatusRequestIdRef.current) {
          networkStatusSettledRequestIdRef.current = statusRequestId;
          setNetworkError(`Unable to load network status: ${networkErrorMessage(error, 'Request failed.')}`);
        }
      });
    const configRequestId = ++networkConfigRequestIdRef.current;
    void client.getConfig()
      .then((nextConfig) => {
        if (configRequestId === networkConfigRequestIdRef.current) {
          setNetworkConfig(nextConfig);
        }
      })
      .catch(() => undefined);
  }, [baseUrl]);

  const composerSessionKey = preserveComposerDraft
    ? `anonymous:${sessionSeed}`
    : selectedSessionId ?? activeSessionId ?? `anonymous:${sessionSeed}`;
  const beastCreationDisabled = Boolean(beastCreationUnavailableReason);

  const refreshNetworkStatusAfterAction = (client: NetworkApiClient): Promise<void> => {
    const statusRequestId = ++networkStatusRequestIdRef.current;
    let done = false;
    const waitForSupersedingStatusRefresh = (): Promise<void> => new Promise((resolve, reject) => {
      const checkSupersedingStatus = () => {
        if (done) {
          resolve();
          return;
        }
        if (networkStatusSuccessRequestIdRef.current > statusRequestId) {
          resolve();
          return;
        }
        if (networkStatusSettledRequestIdRef.current > statusRequestId) {
          reject(new Error('Network status refresh was superseded before a newer refresh succeeded.'));
          return;
        }
        window.setTimeout(checkSupersedingStatus, 25);
      };
      checkSupersedingStatus();
    });
    const statusRefresh = client.getStatus()
      .then((nextStatus) => {
        if (statusRequestId !== networkStatusRequestIdRef.current) {
          if (networkStatusSuccessRequestIdRef.current > statusRequestId) {
            return undefined;
          }
          return waitForSupersedingStatusRefresh();
        }
        setNetworkStatus(nextStatus);
        networkStatusSuccessRequestIdRef.current = statusRequestId;
        networkStatusSettledRequestIdRef.current = statusRequestId;
        setNetworkError(null);
        return undefined;
      })
      .catch((error: unknown) => {
        if (statusRequestId !== networkStatusRequestIdRef.current) {
          if (networkStatusSuccessRequestIdRef.current > statusRequestId) {
            return undefined;
          }
          return waitForSupersedingStatusRefresh();
        }
        networkStatusSettledRequestIdRef.current = statusRequestId;
        throw error;
      });
    return Promise.race([statusRefresh, waitForSupersedingStatusRefresh()])
      .finally(() => {
        done = true;
      });
  };

  useEffect(() => {
    if (preserveComposerDraft || !activeSessionId || selectedSessionId) {
      return;
    }
    setSelectedSessionId(activeSessionId);
  }, [activeSessionId, preserveComposerDraft, selectedSessionId]);

  useEffect(() => {
    let cancelled = false;
    setChatSessionsLoading(true);
    setChatSessionsError(null);

    void chatClient.listSessionsWithDiagnostics(projectId)
      .then(({ sessions, corruptSessions }) => {
        if (!cancelled) {
          setChatSessions(sessions);
          setCorruptChatSessions(corruptSessions);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setChatSessions([]);
          setCorruptChatSessions([]);
          setChatSessionsError(error instanceof Error ? error.message : 'Unable to load conversations.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setChatSessionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatClient, projectId, activeSessionId, sessionSeed, chatSessionsRefreshNonce]);

  useEffect(() => {
    beastAgentsRef.current = beastAgents;
  }, [beastAgents]);

  useEffect(() => {
    beastAgentDetailRef.current = beastAgentDetail;
  }, [beastAgentDetail]);

  useEffect(() => {
    selectedBeastAgentIdRef.current = selectedBeastAgentId;
  }, [selectedBeastAgentId]);

  useEffect(() => {
    if (route !== 'beasts') {
      return;
    }
    const client = beastClient;

    let cancelled = false;

    async function refreshBeasts() {
      let catalog: Awaited<ReturnType<typeof client.getCatalog>>;
      let agents: Awaited<ReturnType<typeof client.listAgents>>;
      let runs: Awaited<ReturnType<typeof client.listRuns>>;
      let containerRuntime: Awaited<ReturnType<typeof client.getContainerRuntimeStatus>>;
      try {
        [catalog, agents, runs, containerRuntime] = await Promise.all([
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
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load Beast dispatch state.';
          beastStreamErrorRef.current = null;
          setBeastError(message);
          setBeastCreationUnavailableReason(message);
        }
        return;
      }

      beastStreamErrorRef.current = null;
      setBeastError(null);
      setBeastCreationUnavailableReason(null);
      setBeastCatalog(catalog);
      setBeastAgents(agents);
      setBeastRuns(runs);
      setBeastContainerRuntime(containerRuntime);
      const autoSelectedAgentId = agents.find((agent) => agent.status !== 'deleted')?.id ?? null;
      const currentAgentId = selectedBeastAgentId ?? (shouldAutoSelectBeastAgentRef.current ? autoSelectedAgentId : null);
      setSelectedBeastAgentId(currentAgentId);

      try {
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
          const message = error instanceof Error ? error.message : 'Unable to load Beast dispatch state.';
          beastStreamErrorRef.current = null;
          setBeastError(message);
        }
      }
    }

    void refreshBeasts();

    return () => {
      cancelled = true;
    };
  }, [route, beastClient, selectedBeastAgentId, beastRefreshNonce]);

  useEffect(() => {
    if (route !== 'beasts') {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const requestBeastRefresh = () => setBeastRefreshNonce((current) => current + 1);

    void beastClient.subscribeToEvents({
      connected: () => {
        if (!cancelled) {
          setBeastError((current) => {
            if (current && beastStreamErrorRef.current === current) {
              beastStreamErrorRef.current = null;
              return null;
            }
            return current;
          });
        }
      },
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
          beastStreamErrorRef.current = error.message;
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
        beastStreamErrorRef.current = null;
        setBeastError(error instanceof Error ? error.message : 'Unable to subscribe to Beast events.');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [route, beastClient]);

  useEffect(() => {
    function syncRouteFromHash() {
      const nextRoute = routeFromHash(window.location.hash);
      const nextHash = `#/${nextRoute}`;

      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }

      setRoute(nextRoute);
      setIsSidebarOpen(false);
    }

    syncRouteFromHash();
    window.addEventListener('hashchange', syncRouteFromHash);
    return () => window.removeEventListener('hashchange', syncRouteFromHash);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 920px)');
    if (!mediaQuery) return;

    const updateMobileSidebarState = () => setIsMobileSidebar(mediaQuery.matches);
    updateMobileSidebarState();
    mediaQuery.addEventListener('change', updateMobileSidebarState);
    return () => mediaQuery.removeEventListener('change', updateMobileSidebarState);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeSidebar();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!isMobileSidebar || !isSidebarOpen || !sidebar) {
      if (wasSidebarOpenRef.current && !isSidebarOpen) {
        sidebarToggleRef.current?.focus();
      }
      wasSidebarOpenRef.current = isSidebarOpen;
      return;
    }

    const focusableElements = getSidebarFocusableElements(sidebar);
    const firstFocusableElement = focusableElements[0];

    firstFocusableElement?.focus();
    wasSidebarOpenRef.current = true;
  }, [isMobileSidebar, isSidebarOpen]);

  const activeRoute = ROUTES.find((item) => item.id === route) ?? ROUTES[0]!;
  const isSidebarHidden = isMobileSidebar && !isSidebarOpen;
  const sidebarHiddenAttributes = isSidebarHidden ? { 'aria-hidden': true, inert: true } : {};
  const focusGuardTabIndex = isMobileSidebar && isSidebarOpen ? 0 : -1;

  function closeSidebar() {
    setIsSidebarOpen(false);
    window.setTimeout(() => sidebarToggleRef.current?.focus(), 0);
  }

  function focusFirstSidebarControl() {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    getSidebarFocusableElements(sidebar)[0]?.focus();
  }

  function focusLastSidebarControl() {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    getSidebarFocusableElements(sidebar).at(-1)?.focus();
  }

  function setPendingBeastAgentAction(agentId: string, action: AgentLifecycleAction | undefined) {
    const next = { ...pendingBeastAgentActionsRef.current };
    if (action) {
      next[agentId] = action;
    } else {
      delete next[agentId];
    }
    pendingBeastAgentActionsRef.current = next;
    setPendingBeastAgentActions(next);
  }

  function runBeastAgentLifecycleAction({
    agentId,
    action,
    request,
    onSuccess,
    errorMessage,
  }: {
    agentId: string;
    action: AgentLifecycleAction;
    request: () => Promise<unknown>;
    onSuccess?: () => void;
    errorMessage: string;
  }) {
    if (!beastClient || pendingBeastAgentActionsRef.current[agentId]) return;

    beastStreamErrorRef.current = null;
    setBeastError(null);
    setPendingBeastAgentAction(agentId, action);
    void request()
      .then(() => {
        onSuccess?.();
        setBeastRefreshNonce((current) => current + 1);
      })
      .catch((err) => {
        beastStreamErrorRef.current = null;
        setBeastError(err instanceof Error ? err.message : errorMessage);
      })
      .finally(() => {
        setPendingBeastAgentAction(agentId, undefined);
      });
  }

  const hasPendingApproval = Boolean(pendingApproval) || sessionState === 'pending_approval';
  const spendLabel = costTelemetryStatus === 'available' ? `$${costUsd.toFixed(2)}` : 'Unavailable';
  const composerDisabled = status === 'connecting'
    || status === 'sending'
    || status === 'streaming'
    || hasPendingApproval;
  const composerDisabledReason = hasPendingApproval
    ? 'Dispatch is disabled while an approval request is pending. Approve or reject it before sending another message.'
    : undefined;

  return (
    <div className={`dashboard-shell ${isSidebarOpen ? 'dashboard-shell--nav-open' : ''}`}>
      <button
        aria-hidden={!isSidebarOpen}
        aria-label="Close navigation overlay"
        className={`sidebar-backdrop ${isSidebarOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={closeSidebar}
        tabIndex={isSidebarOpen ? 0 : -1}
        type="button"
      />

      <aside
        {...sidebarHiddenAttributes}
        aria-label="Primary"
        className={`sidebar ${isSidebarOpen ? 'sidebar--open' : ''}`}
        id="dashboard-sidebar"
        ref={sidebarRef}
      >
        <span className="sidebar__focus-guard" onFocus={focusLastSidebarControl} tabIndex={focusGuardTabIndex} />
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
            onClick={closeSidebar}
            type="button"
          >
            Close
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Dashboard navigation">
          {PRIMARY_NAV_ROUTES.map((item) => (
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
            </a>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__meta">
            <span className="version-chip">v{version}</span>
          </div>
        </div>
        <span className="sidebar__focus-guard" onFocus={focusFirstSidebarControl} tabIndex={focusGuardTabIndex} />
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
              ref={sidebarToggleRef}
              type="button"
            >
              Menu
            </button>

            <div className="topbar__title">
              <p className="eyebrow">Project: {activeProjectId}</p>
              <h1>{activeRoute.label}</h1>
              <p className="topbar__summary">
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
              <dd title={costTelemetryStatus === 'available' ? undefined : 'Cost telemetry has not been reported by this session yet.'}>
                {spendLabel}
              </dd>
            </div>
          </dl>
        </header>

        {route === 'dashboard' ? (
          <main className="dashboard-overview-page">
            <DashboardPage client={dashboardClient} />
          </main>
        ) : route === 'chat' ? (
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
                      aria-describedby="conversation-status"
                      aria-label="Conversation"
                      className="field-control"
                      disabled={chatSessionsLoading}
                      onChange={(event) => {
                        const nextId = event.target.value.trim();
                        setPreserveComposerDraft(false);
                        setSelectedSessionId(nextId || undefined);
                      }}
                      value={selectedSessionId ?? ''}
                    >
                      <option value="">Current conversation</option>
                      {chatSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {formatSessionOptionLabel(session)}
                        </option>
                      ))}
                    </select>
                    {chatSessionsLoading ? (
                      <small id="conversation-status" className="field-hint" role="status">
                        Loading saved conversations…
                      </small>
                    ) : chatSessionsError ? (
                      <small id="conversation-status" className="field-error" role="alert">
                        Failed to load conversations: {chatSessionsError}
                      </small>
                    ) : chatSessions.length === 0 ? (
                      <small id="conversation-status" className="field-hint">
                        No saved conversations yet.
                      </small>
                    ) : (
                      <small id="conversation-status" className="field-hint">
                        {chatSessions.length} saved {chatSessions.length === 1 ? 'conversation' : 'conversations'} available.
                      </small>
                    )}
                    {!chatSessionsLoading && !chatSessionsError && corruptChatSessions.length > 0 ? (
                      <small className="field-error" role="alert">
                        {corruptChatSessions.length} corrupted saved {corruptChatSessions.length === 1 ? 'conversation was' : 'conversations were'} quarantined and omitted.
                      </small>
                    ) : null}
                  </label>
                  {chatSessionsError ? (
                    <button
                      className="button button--secondary button--compact"
                      onClick={() => setChatSessionsRefreshNonce((current) => current + 1)}
                      type="button"
                    >
                      Retry conversations
                    </button>
                  ) : null}
                  <button
                    className="button button--secondary"
                    onClick={() => {
                      setPreserveComposerDraft(true);
                      setSelectedSessionId(undefined);
                      setSessionSeed((current) => current + 1);
                    }}
                    type="button"
                  >
                    New conversation
                  </button>
                </div>
              </section>

              <ChatErrorBanners
                banners={errorBanners}
                onDismiss={dismissError}
                onRetry={(bannerId) => {
                  void retryError(bannerId).then((retriedContent) => {
                    if (retriedContent) {
                      setClearedFailedDraft((current) => ({
                        content: retriedContent,
                        nonce: (current?.nonce ?? 0) + 1,
                      }));
                    }
                  }).catch(() => undefined);
                }}
              />
              <TranscriptPane
                messages={messages}
                onRetryMessage={(messageId) => {
                  const retriedMessage = messages.find((message) => message.id === messageId);
                  void retryMessage(messageId).then(() => {
                    if (retriedMessage?.role === 'user') {
                      setClearedFailedDraft((current) => ({
                        content: retriedMessage.content,
                        nonce: (current?.nonce ?? 0) + 1,
                      }));
                    }
                  }).catch(() => undefined);
                }}
                resetKey={`${activeProjectId}:${activeSessionId ?? selectedSessionId ?? 'new'}:${sessionSeed}`}
                retryDisabled={hasPendingApproval || (status !== 'idle' && status !== 'error')}
                showTypingIndicator={showTypingIndicator}
              />
              <Composer
                key={composerSessionKey}
                connectionStatus={connectionStatus}
                clearedFailedDraft={clearedFailedDraft}
                disabled={composerDisabled}
                disabledReasonText={composerDisabledReason}
                onReconnect={reconnect}
                onSend={send}
                status={status}
              />
            </section>

            <aside className="chat-page__rail">
              <CostBadge
                tier={tier ?? 'pending'}
                costTelemetryStatus={costTelemetryStatus}
                tokenTelemetryStatus={tokenTelemetryStatus}
                tokenTotals={tokenTotals}
                costUsd={costUsd}
              />
              <ActivityPane events={activity} resetKey={`${activeProjectId}:${activeSessionId ?? selectedSessionId ?? 'new'}:${sessionSeed}`} />
              <ApprovalCard
                pending={hasPendingApproval}
                approval={pendingApproval}
                description={pendingApproval?.description ?? (hasPendingApproval ? 'Approval is pending. Approve or reject it before sending another message.' : '')}
                resolving={approvalResolving}
                error={approvalError}
                sessionId={activeSessionId}
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
            disabled={beastCreationDisabled}
            error={beastError}
            logs={beastAgentDetail?.run?.logs ?? []}
            pendingAgentActions={pendingBeastAgentActions}
            selectedAgentId={selectedBeastAgentId}
            dashboardClient={dashboardClient}
            onClose={() => {
              shouldAutoSelectBeastAgentRef.current = false;
              selectedBeastAgentIdRef.current = null;
              setSelectedBeastAgentId(null);
              setBeastAgentDetail(null);
            }}
            onLaunch={async (config) => {
              const definitionId = resolveWizardDefinitionId(config);
              const executionMode = config.executionMode === 'container' ? 'container' : 'process';
              const launchChatSessionId = selectedSessionId ?? activeSessionId ?? undefined;
              const initAction = buildInitAction(definitionId, config, launchChatSessionId);
              const moduleConfig = config.moduleConfig && typeof config.moduleConfig === 'object' && !Array.isArray(config.moduleConfig)
                ? config.moduleConfig as ModuleConfig
                : undefined;
              try {
                await beastClient.createAgent({
                  definitionId,
                  initAction,
                  initConfig: config,
                  executionMode,
                  ...(moduleConfig ? { moduleConfig } : {}),
                  ...(launchChatSessionId ? { chatSessionId: launchChatSessionId } : {}),
                });
                setBeastRefreshNonce((current) => current + 1);
              } catch (error) {
                if (error instanceof BeastApiError && error.code === 'AGENT_DISPATCH_FAILED') {
                  setBeastRefreshNonce((current) => current + 1);
                }
                throw error;
              }
            }}
            onDelete={(agentId) => {
              runBeastAgentLifecycleAction({
                agentId,
                action: 'delete',
                request: () => beastClient.deleteAgent(agentId),
                onSuccess: () => {
                  shouldAutoSelectBeastAgentRef.current = false;
                  setSelectedBeastAgentId((current) => {
                    if (current !== agentId) {
                      return current;
                    }
                    selectedBeastAgentIdRef.current = null;
                    return null;
                  });
                  setBeastAgentDetail((current) => current?.agent.id === agentId ? null : current);
                },
                errorMessage: 'Unable to delete tracked agent.',
              });
            }}
            onKill={(agentId) => {
              runBeastAgentLifecycleAction({
                agentId,
                action: 'kill',
                request: () => beastClient.killAgent(agentId),
                errorMessage: 'Unable to kill tracked agent.',
              });
            }}
            onRestart={(agentId) => {
              runBeastAgentLifecycleAction({
                agentId,
                action: 'restart',
                request: () => beastClient.restartAgent(agentId),
                errorMessage: 'Unable to restart tracked agent.',
              });
            }}
            onResume={(agentId) => {
              runBeastAgentLifecycleAction({
                agentId,
                action: 'resume',
                request: () => beastClient.resumeAgent(agentId),
                errorMessage: 'Unable to resume tracked agent.',
              });
            }}
            onSaveAgentConfig={async (agentId, values) => {
              setBeastError(null);
              await beastClient.patchAgentConfig(agentId, values);
              const detail = await beastClient.getAgent(agentId);
              if (selectedBeastAgentIdRef.current === agentId) {
                setBeastAgentDetail(detail);
              }
              setBeastRefreshNonce((current) => current + 1);
            }}
            onSelectAgent={(agentId) => {
              shouldAutoSelectBeastAgentRef.current = true;
              selectedBeastAgentIdRef.current = agentId;
              setSelectedBeastAgentId(agentId);
            }}
            onStart={(agentId) => {
              runBeastAgentLifecycleAction({
                agentId,
                action: 'start',
                request: () => beastClient.startAgent(agentId),
                errorMessage: 'Unable to start tracked agent.',
              });
            }}
            onStop={(agentId) => {
              runBeastAgentLifecycleAction({
                agentId,
                action: 'stop',
                request: () => beastClient.stopAgent(agentId),
                errorMessage: 'Unable to stop tracked agent.',
              });
            }}
          />
        ) : route === 'network' ? (
          <NetworkPage
            config={networkConfig}
            error={networkError ?? networkConfigError}
            logs={networkLogs}
            logsError={networkLogsError}
            logsLoading={networkLogsLoading}
            onRefresh={() => {
              const client = new NetworkApiClient(baseUrl);
              const logServiceId = selectedNetworkLogServiceId;
              const statusRequestId = ++networkStatusRequestIdRef.current;
              const requestId = ++networkLogsRequestIdRef.current;
              if (logServiceId) {
                setNetworkLogsLoading(true);
                setNetworkLogsError(null);
              }
              void client.getStatus()
                .then((nextStatus) => {
                  if (statusRequestId === networkStatusRequestIdRef.current) {
                    setNetworkStatus(nextStatus);
                    networkStatusSuccessRequestIdRef.current = statusRequestId;
                    networkStatusSettledRequestIdRef.current = statusRequestId;
                    setNetworkError(null);
                  }
                })
                .catch((error: unknown) => {
                  if (statusRequestId === networkStatusRequestIdRef.current) {
                    networkStatusSettledRequestIdRef.current = statusRequestId;
                    setNetworkError(`Unable to refresh network status: ${networkErrorMessage(error, 'Request failed.')}`);
                  }
                });
              const configRequestId = ++networkConfigRequestIdRef.current;
              void client.getConfig()
                .then((nextConfig) => {
                  if (configRequestId === networkConfigRequestIdRef.current) {
                    setNetworkConfig(nextConfig);
                    setNetworkConfigError(null);
                  }
                })
                .catch((error: unknown) => {
                  if (configRequestId === networkConfigRequestIdRef.current) {
                    setNetworkConfigError(`Unable to refresh network config: ${networkErrorMessage(error, 'Request failed.')}`);
                  }
                });
              if (!logServiceId) {
                return;
              }
              void client.getLogs(logServiceId)
                .then((logsResult) => {
                  if (requestId !== networkLogsRequestIdRef.current) {
                    return;
                  }
                  setNetworkLogs(logsResult.logs);
                  setNetworkLogsError(null);
                })
                .catch((error: unknown) => {
                  if (requestId === networkLogsRequestIdRef.current) {
                    setNetworkLogs([]);
                    setNetworkLogsError(error instanceof Error ? error.message : 'Unable to refresh logs.');
                  }
                })
                .finally(() => {
                  if (requestId === networkLogsRequestIdRef.current) {
                    setNetworkLogsLoading(false);
                  }
                });
            }}
            onRestart={(serviceId) => {
              const client = new NetworkApiClient(baseUrl);
              return client.restart(serviceId).then(() => {
                return refreshNetworkStatusAfterAction(client);
              });
            }}
            onSaveConfig={(assignments) => {
              const client = new NetworkApiClient(baseUrl);
              return client.updateConfig(assignments).then((nextConfig) => {
                networkConfigRequestIdRef.current += 1;
                setNetworkConfig(nextConfig);
                setNetworkConfigError(null);
              });
            }}
            onSelectLogService={(serviceId) => {
              const nextServiceId = serviceId.trim();
              const requestId = ++networkLogsRequestIdRef.current;
              setSelectedNetworkLogServiceId(nextServiceId || undefined);
              setNetworkLogs([]);
              setNetworkLogsError(null);
              if (!nextServiceId) {
                setNetworkLogsLoading(false);
                return;
              }
              const client = new NetworkApiClient(baseUrl);
              setNetworkLogsLoading(true);
              void client.getLogs(nextServiceId)
                .then(({ logs }) => {
                  if (requestId !== networkLogsRequestIdRef.current) {
                    return;
                  }
                  setNetworkLogs(logs);
                  setNetworkLogsError(null);
                })
                .catch((error: unknown) => {
                  if (requestId !== networkLogsRequestIdRef.current) {
                    return;
                  }
                  setNetworkLogs([]);
                  setNetworkLogsError(error instanceof Error ? error.message : 'Unable to load logs.');
                })
                .finally(() => {
                  if (requestId === networkLogsRequestIdRef.current) {
                    setNetworkLogsLoading(false);
                  }
                });
            }}
            onStart={(serviceId) => {
              const client = new NetworkApiClient(baseUrl);
              return client.start(serviceId).then(() => {
                return refreshNetworkStatusAfterAction(client);
              });
            }}
            onStop={(serviceId) => {
              const client = new NetworkApiClient(baseUrl);
              return client.stop(serviceId).then(() => {
                return refreshNetworkStatusAfterAction(client);
              });
            }}
            selectedLogServiceId={selectedNetworkLogServiceId}
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
