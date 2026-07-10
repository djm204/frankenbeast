import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatShell, buildInitAction } from '../../src/components/chat-shell.js';
import { BeastApiError } from '../../src/lib/beast-api.js';
import { FALLBACK_BEAST_CATALOG } from '../../src/components/beasts/wizard-catalog.js';
import { useDashboardStore } from '../../src/stores/dashboard-store.js';
import { useBeastStore } from '../../src/stores/beast-store.js';

const mockListSessions = vi.fn().mockResolvedValue([
  {
    id: 'sess-1',
    projectId: 'test-project',
    state: 'active',
    messageCount: 2,
    preview: 'Dispatch accepted.',
    createdAt: '2026-03-09T00:00:00Z',
    updatedAt: '2026-03-09T00:00:01Z',
  },
]);

const mockGetCatalog = vi.fn().mockResolvedValue([
  {
    id: 'chunk-plan',
    label: 'Design Doc -> Chunk Creation',
    description: 'Build chunks from a design doc',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'designDocPath', prompt: 'Design doc', kind: 'file', required: true },
      { key: 'outputDir', prompt: 'Output directory', kind: 'string', required: true },
    ],
  },
  {
    id: 'martin-loop',
    label: 'Martin Loop',
    description: 'Run Martin loop',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'provider', prompt: 'Provider', kind: 'string', options: ['claude', 'codex'] },
      { key: 'objective', prompt: 'Objective', kind: 'string' },
      { key: 'chunkDirectory', prompt: 'Chunk directory', kind: 'directory', required: true },
    ],
  },
]);

const mockListAgents = vi.fn().mockResolvedValue([
  {
    id: 'agent-1',
    definitionId: 'chunk-plan',
    status: 'dispatching',
    source: 'chat',
    createdByUser: 'chat-session:sess-1',
    initAction: {
      kind: 'chunk-plan',
      command: '/plan --design-doc docs/plans/design.md',
      config: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
    },
    initConfig: { designDocPath: 'docs/plans/design.md' },
    chatSessionId: 'sess-1',
    dispatchRunId: 'run-1',
    createdAt: '2026-03-11T00:00:00.000Z',
    updatedAt: '2026-03-11T00:00:01.000Z',
  },
]);

const mockListRuns = vi.fn().mockResolvedValue([
  {
    id: 'run-1',
    definitionId: 'chunk-plan',
    status: 'running',
    dispatchedBy: 'chat',
    dispatchedByUser: 'chat-session:sess-1',
    trackedAgentId: 'agent-1',
    attemptCount: 1,
    executionMode: 'process',
    createdAt: '2026-03-11T00:00:02.000Z',
  },
]);
const mockGetContainerRuntimeStatus = vi.fn().mockResolvedValue({ available: true });

const mockGetAgent = vi.fn().mockResolvedValue({
  agent: {
    id: 'agent-1',
    definitionId: 'chunk-plan',
    status: 'dispatching',
    source: 'chat',
    createdByUser: 'chat-session:sess-1',
    initAction: {
      kind: 'chunk-plan',
      command: '/plan --design-doc docs/plans/design.md',
      config: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
    },
    initConfig: { designDocPath: 'docs/plans/design.md' },
    chatSessionId: 'sess-1',
    dispatchRunId: 'run-1',
    createdAt: '2026-03-11T00:00:00.000Z',
    updatedAt: '2026-03-11T00:00:01.000Z',
  },
  events: [
    {
      id: 'event-1',
      agentId: 'agent-1',
      sequence: 1,
      level: 'info',
      type: 'agent.command.sent',
      message: 'sent planning command',
      payload: {},
      createdAt: '2026-03-11T00:00:01.000Z',
    },
  ],
});

const mockGetRun = vi.fn().mockResolvedValue({
  run: {
    id: 'run-1',
    definitionId: 'chunk-plan',
    status: 'running',
    dispatchedBy: 'chat',
    dispatchedByUser: 'chat-session:sess-1',
    attemptCount: 1,
    createdAt: '2026-03-11T00:00:02.000Z',
  },
  attempts: [],
  events: [],
});

const mockGetLogs = vi.fn().mockResolvedValue(['started from chat']);
const mockCreateAgent = vi.fn().mockResolvedValue({
  id: 'agent-2',
  definitionId: 'chunk-plan',
  status: 'initializing',
  source: 'dashboard',
  createdByUser: 'operator',
  initAction: {
    kind: 'chunk-plan',
    command: '/plan --design-doc docs/plans/design.md',
    config: { designDocPath: 'docs/plans/design.md' },
    chatSessionId: 'sess-1',
  },
  initConfig: { designDocPath: 'docs/plans/design.md' },
  chatSessionId: 'sess-1',
  createdAt: '2026-03-11T00:00:02.000Z',
  updatedAt: '2026-03-11T00:00:02.000Z',
});
const mockDeleteAgent = vi.fn().mockResolvedValue(undefined);
const mockKillAgent = vi.fn().mockResolvedValue(undefined);
const mockRestartAgent = vi.fn().mockResolvedValue(undefined);
const mockResumeAgent = vi.fn().mockResolvedValue(undefined);
const mockStartAgent = vi.fn().mockResolvedValue(undefined);
const mockStopAgent = vi.fn().mockResolvedValue(undefined);
let latestBeastEventHandlers: Record<string, (event: unknown) => void> | null = null;
const mockSubscribeToEvents = vi.fn().mockImplementation((handlers: Record<string, (event: unknown) => void>) => {
  latestBeastEventHandlers = handlers;
  return Promise.resolve(vi.fn());
});
const mockNetworkGetStatus = vi.fn().mockResolvedValue({
  mode: 'secure',
  secureBackend: 'local-encrypted',
  services: [{ id: 'chat-server', status: 'running' }],
});
const mockNetworkGetConfig = vi.fn().mockResolvedValue({
  network: { mode: 'secure', secureBackend: 'local-encrypted' },
  chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
});
const mockNetworkGetLogs = vi.fn().mockResolvedValue({ logs: ['chat log line'] });
const mockNetworkStart = vi.fn().mockResolvedValue(undefined);
const mockNetworkStop = vi.fn().mockResolvedValue(undefined);
const mockNetworkRestart = vi.fn().mockResolvedValue(undefined);
const mockDashboardSnapshot = {
  skills: [
    { name: 'github', enabled: true, hasContext: false, mcpServerCount: 1 },
  ],
  security: {
    profile: 'standard',
    injectionDetection: true,
    piiMasking: true,
    outputValidation: true,
    requireApproval: 'destructive',
  },
  providers: [
    { name: 'claude', type: 'claude-cli', available: true, failoverOrder: 0 },
  ],
};
const mockDashboardFetchSnapshot = vi.fn().mockResolvedValue(mockDashboardSnapshot);
const mockDashboardToggleSkill = vi.fn().mockResolvedValue(undefined);
const mockDashboardUpdateSecurityProfile = vi.fn().mockResolvedValue(undefined);
const mockDashboardSubscribe = vi.fn().mockResolvedValue(vi.fn());

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('../../src/hooks/use-chat-session.js', () => ({
  useChatSession: () => ({
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: '2026-03-09T00:00:00Z',
        receipt: 'read',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Dispatch accepted.',
        timestamp: '2026-03-09T00:00:01Z',
        modelTier: 'cheap',
        streaming: false,
      },
      {
        id: 'user-failed',
        role: 'user',
        content: 'Retry this failed request',
        timestamp: '2026-03-09T00:00:02Z',
        receipt: 'failed',
        error: 'network failed',
        canRetry: true,
      },
    ],
    status: 'idle' as const,
    connectionStatus: 'connected' as const,
    tier: 'cheap',
    tokenTotals: { cheap: 5, premiumReasoning: 2, premiumExecution: 1 },
    costUsd: 0.42,
    sessionId: 'sess-1',
    projectId: 'test-project',
    pendingApproval: { description: 'Approve deploy', requestedAt: '2026-03-09T00:00:02Z' },
    activity: [
      { type: 'turn.execution.start', data: { taskDescription: 'Deploy' }, timestamp: '2026-03-09T00:00:03Z' },
    ],
    send: vi.fn(),
    approve: vi.fn(),
  }),
}));

vi.mock('../../src/lib/api.js', () => ({
  ChatApiClient: vi.fn(function (this: { listSessions: typeof mockListSessions }) {
    this.listSessions = mockListSessions;
  }),
}));

vi.mock('../../src/lib/beast-api.js', () => ({
  BeastApiError: class BeastApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
      public readonly details?: unknown,
    ) {
      super(message);
      this.name = 'BeastApiError';
    }
  },
  MODULE_CONFIG_KEYS: ['firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat'],
  TRACKED_AGENT_STATUSES: [
    'initializing',
    'awaiting_approval',
    'dispatching',
    'running',
    'completed',
    'failed',
    'stopped',
    'deleted',
  ],
  BeastApiClient: vi.fn(function (this: {
    getCatalog: typeof mockGetCatalog;
    listAgents: typeof mockListAgents;
    listRuns: typeof mockListRuns;
    getContainerRuntimeStatus: typeof mockGetContainerRuntimeStatus;
    getAgent: typeof mockGetAgent;
    getRun: typeof mockGetRun;
    getLogs: typeof mockGetLogs;
    createAgent: typeof mockCreateAgent;
    deleteAgent: typeof mockDeleteAgent;
    killAgent: typeof mockKillAgent;
    restartAgent: typeof mockRestartAgent;
    resumeAgent: typeof mockResumeAgent;
    startAgent: typeof mockStartAgent;
    stopAgent: typeof mockStopAgent;
    patchAgentConfig: ReturnType<typeof vi.fn>;
    startRun: ReturnType<typeof vi.fn>;
    stopRun: ReturnType<typeof vi.fn>;
    killRun: ReturnType<typeof vi.fn>;
    restartRun: ReturnType<typeof vi.fn>;
    subscribeToEvents: typeof mockSubscribeToEvents;
  }) {
    this.getCatalog = mockGetCatalog;
    this.listAgents = mockListAgents;
    this.listRuns = mockListRuns;
    this.getContainerRuntimeStatus = mockGetContainerRuntimeStatus;
    this.getAgent = mockGetAgent;
    this.getRun = mockGetRun;
    this.getLogs = mockGetLogs;
    this.createAgent = mockCreateAgent;
    this.deleteAgent = mockDeleteAgent;
    this.killAgent = mockKillAgent;
    this.restartAgent = mockRestartAgent;
    this.resumeAgent = mockResumeAgent;
    this.startAgent = mockStartAgent;
    this.stopAgent = mockStopAgent;
    this.patchAgentConfig = vi.fn().mockResolvedValue(undefined);
    this.startRun = vi.fn().mockResolvedValue(undefined);
    this.stopRun = vi.fn().mockResolvedValue(undefined);
    this.killRun = vi.fn().mockResolvedValue(undefined);
    this.restartRun = vi.fn().mockResolvedValue(undefined);
    this.subscribeToEvents = mockSubscribeToEvents;
  }),
}));

vi.mock('../../src/lib/network-api.js', () => ({
  NetworkApiClient: vi.fn(function (this: {
    getStatus: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    getLogs: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    restart: ReturnType<typeof vi.fn>;
  }) {
    this.getStatus = mockNetworkGetStatus;
    this.getConfig = mockNetworkGetConfig;
    this.getLogs = mockNetworkGetLogs;
    this.start = mockNetworkStart;
    this.stop = mockNetworkStop;
    this.restart = mockNetworkRestart;
  }),
}));

vi.mock('../../src/lib/dashboard-api.js', () => ({
  DashboardApiClient: vi.fn(function (this: {
    fetchSnapshot: ReturnType<typeof vi.fn>;
    toggleSkill: ReturnType<typeof vi.fn>;
    updateSecurityProfile: ReturnType<typeof vi.fn>;
    subscribeToDashboard: ReturnType<typeof vi.fn>;
  }) {
    this.fetchSnapshot = mockDashboardFetchSnapshot;
    this.toggleSkill = mockDashboardToggleSkill;
    this.updateSecurityProfile = mockDashboardUpdateSecurityProfile;
    this.subscribeToDashboard = mockDashboardSubscribe;
  }),
}));

afterEach(() => {
  cleanup();
  window.location.hash = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useDashboardStore.getState().reset();
  useBeastStore.getState().resetWizard();
  latestBeastEventHandlers = null;
  mockSubscribeToEvents.mockImplementation((handlers: Record<string, (event: unknown) => void>) => {
    latestBeastEventHandlers = handlers;
    return Promise.resolve(vi.fn());
  });
  mockGetCatalog.mockReset();
  mockGetCatalog.mockResolvedValue([
    {
      id: 'chunk-plan',
      label: 'Design Doc -> Chunk Creation',
      description: 'Build chunks from a design doc',
      executionModeDefault: 'process',
      interviewPrompts: [
        { key: 'designDocPath', prompt: 'Design doc', kind: 'file', required: true },
        { key: 'outputDir', prompt: 'Output directory', kind: 'string', required: true },
      ],
    },
    {
      id: 'martin-loop',
      label: 'Martin Loop',
      description: 'Run Martin loop',
      executionModeDefault: 'process',
      interviewPrompts: [
        { key: 'provider', prompt: 'Provider', kind: 'string', options: ['claude', 'codex'] },
        { key: 'objective', prompt: 'Objective', kind: 'string' },
        { key: 'chunkDirectory', prompt: 'Chunk directory', kind: 'directory', required: true },
      ],
    },
  ]);
  mockListSessions.mockResolvedValue([
    {
      id: 'sess-1',
      projectId: 'test-project',
      state: 'active',
      messageCount: 2,
      preview: 'Dispatch accepted.',
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:01Z',
    },
  ]);
  mockListAgents.mockResolvedValue([
    {
      id: 'agent-1',
      definitionId: 'chunk-plan',
      status: 'dispatching',
      source: 'chat',
      createdByUser: 'chat-session:sess-1',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
      dispatchRunId: 'run-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:01.000Z',
    },
  ]);
  mockListRuns.mockResolvedValue([
    {
      id: 'run-1',
      definitionId: 'chunk-plan',
      status: 'running',
      dispatchedBy: 'chat',
      dispatchedByUser: 'chat-session:sess-1',
      trackedAgentId: 'agent-1',
      attemptCount: 1,
      executionMode: 'process',
      createdAt: '2026-03-11T00:00:02.000Z',
    },
  ]);
  mockGetContainerRuntimeStatus.mockResolvedValue({ available: true });
  mockGetAgent.mockResolvedValue({
    agent: {
      id: 'agent-1',
      definitionId: 'chunk-plan',
      status: 'dispatching',
      source: 'chat',
      createdByUser: 'chat-session:sess-1',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/design.md',
        config: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/design.md' },
      chatSessionId: 'sess-1',
      dispatchRunId: 'run-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:01.000Z',
    },
    events: [
      {
        id: 'event-1',
        agentId: 'agent-1',
        sequence: 1,
        level: 'info',
        type: 'agent.command.sent',
        message: 'sent planning command',
        payload: {},
        createdAt: '2026-03-11T00:00:01.000Z',
      },
    ],
  });
  mockResumeAgent.mockReset();
  mockResumeAgent.mockResolvedValue(undefined);
  mockGetLogs.mockReset();
  mockGetLogs.mockResolvedValue(['started from chat']);
  mockNetworkGetStatus.mockReset();
  mockNetworkGetStatus.mockResolvedValue({
    mode: 'secure',
    secureBackend: 'local-encrypted',
    services: [{ id: 'chat-server', status: 'running' }],
  });
  mockNetworkGetConfig.mockReset();
  mockNetworkGetConfig.mockResolvedValue({
    network: { mode: 'secure', secureBackend: 'local-encrypted' },
    chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
  });
  mockNetworkGetLogs.mockReset();
  mockNetworkGetLogs.mockResolvedValue({ logs: ['chat log line'] });
  mockNetworkStart.mockReset();
  mockNetworkStart.mockResolvedValue(undefined);
  mockNetworkStop.mockReset();
  mockNetworkStop.mockResolvedValue(undefined);
  mockNetworkRestart.mockReset();
  mockNetworkRestart.mockResolvedValue(undefined);
  mockDashboardFetchSnapshot.mockReset();
  mockDashboardFetchSnapshot.mockResolvedValue(mockDashboardSnapshot);
  mockDashboardToggleSkill.mockReset();
  mockDashboardToggleSkill.mockResolvedValue(undefined);
  mockDashboardUpdateSecurityProfile.mockReset();
  mockDashboardUpdateSecurityProfile.mockResolvedValue(undefined);
  mockDashboardSubscribe.mockReset();
  mockDashboardSubscribe.mockResolvedValue(vi.fn());
  mockGetRun.mockReset();
  mockGetRun.mockResolvedValue({
    run: {
      id: 'run-1',
      definitionId: 'chunk-plan',
      status: 'running',
      dispatchedBy: 'chat',
      dispatchedByUser: 'chat-session:sess-1',
      attemptCount: 1,
      createdAt: '2026-03-11T00:00:02.000Z',
    },
    attempts: [],
    events: [],
  });
});

describe('buildInitAction', () => {
  it('reads chunk-plan design doc paths from the nested wizard workflow config', () => {
    expect(buildInitAction('chunk-plan', {
      workflow: { workflowType: 'chunk-plan', docPath: 'docs/design.md' },
      outputDir: 'tasks/chunks',
      executionMode: 'process',
    }, 'sess-1')).toMatchObject({
      kind: 'chunk-plan',
      command: '/plan --design-doc docs/design.md',
      chatSessionId: 'sess-1',
    });
  });

  it('prefers normalized chunk-plan design doc paths when present', () => {
    expect(buildInitAction('chunk-plan', {
      workflow: { workflowType: 'chunk-plan', docPath: 'docs/from-workflow.md' },
      designDocPath: 'docs/from-normalized.md',
    }, undefined)).toMatchObject({
      kind: 'chunk-plan',
      command: '/plan --design-doc docs/from-normalized.md',
    });
  });

  it('keeps every fallback wizard workflow aligned with an init action kind', () => {
    for (const workflow of FALLBACK_BEAST_CATALOG) {
      expect(buildInitAction(workflow.id, { workflow: { workflowType: workflow.id } }, undefined).kind).toBe(workflow.id);
    }
  });

  it('rejects unsupported wizard definitions instead of coercing them to martin-loop', () => {
    expect(() => buildInitAction('issues-agent', {
      workflow: { workflowType: 'issues-agent' },
    }, undefined)).toThrow(/Unsupported Beast workflow definition/);
  });
});

describe('ChatShell', () => {
  it('renders Frankenbeast branding and keeps the version in the sidebar footer', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);
    const nav = container.querySelector('[aria-label="Dashboard navigation"]');
    const brand = container.querySelector('.sidebar__brand');
    const footer = container.querySelector('.sidebar__footer');

    expect(footer?.textContent).toContain('v0.9.0');
    expect(brand?.textContent).not.toContain('v0.9.0');
    expect(nav?.textContent).toContain('Overview');
    expect(nav?.textContent).toContain('Chat');
    expect(nav?.textContent).toContain('Beasts');
    expect(nav?.textContent).toContain('Network');
    expect(nav?.textContent).toContain('Analytics');
    expect(nav?.textContent).not.toContain('Sessions');
    expect(nav?.textContent).not.toContain('Costs');
    expect(nav?.textContent).not.toContain('Safety');
    expect(nav?.textContent).not.toContain('Settings');
  });

  it('mounts the dashboard overview as a first-class navigation route', async () => {
    window.location.hash = '#/dashboard';

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    expect(screen.getByRole('link', { name: /Overview/ })).toHaveProperty('hash', '#/dashboard');
    expect(screen.getAllByText('Snapshot controls for skills, security, and providers').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(mockDashboardFetchSnapshot).toHaveBeenCalledTimes(1);
      expect(mockDashboardSubscribe).toHaveBeenCalledTimes(1);
      expect(screen.getByText('github')).toBeDefined();
      expect(screen.getByText('Injection Detection: [on]')).toBeDefined();
      expect(screen.getByText('claude')).toBeDefined();
    });
  });

  it('renders the chat workspace inside the dashboard shell', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    expect(screen.getByText('Dispatch accepted.')).toBeDefined();
    expect(screen.getByLabelText('Conversation')).toBeDefined();
    expect(screen.getByRole('textbox')).toBeDefined();
    expect(screen.getByText('Approve deploy')).toBeDefined();
    expect(screen.getByText('turn.execution.start')).toBeDefined();
  });

  it('disables normal chat input while approval is pending', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Dispatch' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Resend failed message' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Dispatch is disabled while an approval request is pending. Approve or reject it before sending another message.')).toBeDefined();
  });

  it('labels conversations with preview, state, message count, updated time, and a shortened id', async () => {
    mockListSessions.mockResolvedValue([
      {
        id: 'session-1234567890abcdef',
        projectId: 'test-project',
        state: 'awaiting_approval',
        messageCount: 3,
        preview: 'Need deploy approval',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await waitFor(() => {
      expect(screen.getByRole('option', {
        name: /Need deploy approval — awaiting_approval · 3 messages · updated just now · session-…cdef/,
      })).toBeDefined();
      expect(screen.getByText('1 saved conversation available.')).toBeDefined();
    });
  });

  it('shows loading, error, and retry states for conversation list failures', async () => {
    mockListSessions.mockRejectedValueOnce(new Error('session service down'));

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    const conversationSelect = screen.getByLabelText('Conversation') as HTMLSelectElement;
    expect(conversationSelect.disabled).toBe(true);
    expect(screen.getByText('Loading saved conversations…')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('session service down');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry conversations' }));

    await waitFor(() => {
      expect(mockListSessions).toHaveBeenCalledTimes(2);
      expect(screen.getByText('1 saved conversation available.')).toBeDefined();
    });
  });

  it('distinguishes an empty conversation list from a failed load', async () => {
    mockListSessions.mockResolvedValueOnce([]);

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await waitFor(() => {
      expect(screen.getByText('No saved conversations yet.')).toBeDefined();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('surfaces initial network status load failures before config settles', async () => {
    window.location.hash = '#/network';
    const slowConfig = deferred<{ network: { mode: 'secure'; secureBackend: 'local-encrypted' }; chat: { model: string; enabled: boolean; host: string; port: number } }>();
    mockNetworkGetStatus.mockRejectedValueOnce(new Error('status endpoint unavailable'));
    mockNetworkGetConfig.mockReturnValueOnce(slowConfig.promise);

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Unable to load network status: status endpoint unavailable');
    });

    act(() => {
      slowConfig.resolve({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
      });
    });
  });

  it('fetches network logs when a service is selected on the Network page', async () => {
    window.location.hash = '#/network';
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Service logs')).toBeDefined();
      expect(screen.getByRole('option', { name: /chat-server/i })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'chat-server' } });

    await waitFor(() => {
      expect(mockNetworkGetLogs).toHaveBeenCalledWith('chat-server');
      expect(screen.getByText('chat log line')).toBeDefined();
    });
  });

  it('ignores stale network log responses after a later service selection wins', async () => {
    window.location.hash = '#/network';
    let resolveChatLogs!: (value: { logs: string[] }) => void;
    const chatLogs = new Promise<{ logs: string[] }>((resolve) => {
      resolveChatLogs = resolve;
    });
    mockNetworkGetLogs.mockImplementation((serviceId: string) => serviceId === 'chat-server'
      ? chatLogs
      : Promise.resolve({ logs: ['dashboard log line'] }));
    mockNetworkGetStatus.mockResolvedValue({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      services: [
        { id: 'chat-server', status: 'running' },
        { id: 'dashboard', status: 'running' },
      ],
    });

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Service logs')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'chat-server' } });
    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'dashboard' } });

    await waitFor(() => {
      expect(screen.getByText('dashboard log line')).toBeDefined();
    });

    resolveChatLogs({ logs: ['stale chat log line'] });

    await waitFor(() => {
      expect(screen.queryByText('stale chat log line')).toBeNull();
      expect(screen.getByText('dashboard log line')).toBeDefined();
    });
  });

  it('clears stale network logs and reports refresh failures', async () => {
    window.location.hash = '#/network';
    mockNetworkGetLogs.mockResolvedValueOnce({ logs: ['current log line'] });
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Service logs')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'chat-server' } });

    await waitFor(() => {
      expect(screen.getByText('current log line')).toBeDefined();
    });

    mockNetworkGetLogs.mockRejectedValueOnce(new Error('log endpoint failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(screen.queryByText('current log line')).toBeNull();
      expect(screen.getByRole('alert').textContent).toContain('log endpoint failed');
    });
  });

  it('shows pending and failure feedback for valid network service actions', async () => {
    window.location.hash = '#/network';
    let rejectStart!: (error: Error) => void;
    mockNetworkGetStatus.mockResolvedValueOnce({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      services: [{ id: 'chat-server', status: 'stopped' }],
    });
    mockNetworkStart.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectStart = reject;
    }));

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    const startButton = await screen.findByRole('button', { name: 'Start chat-server' });

    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(mockNetworkStart).toHaveBeenCalledTimes(1);
    expect(startButton).toHaveProperty('disabled', true);
    expect(screen.getByText('Starting chat-server…')).toBeDefined();

    rejectStart(new Error('service manager unreachable'));

    await waitFor(() => {
      expect(startButton).toHaveProperty('disabled', false);
      expect(screen.getByRole('alert').textContent).toContain('Unable to start chat-server: service manager unreachable');
    });
  });

  it('shows success feedback and refreshes status after network service actions complete', async () => {
    window.location.hash = '#/network';
    mockNetworkGetStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'stopped' }],
      })
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'running' }],
      });

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Start chat-server' }));

    await waitFor(() => {
      expect(mockNetworkStart).toHaveBeenCalledWith('chat-server');
      expect(screen.getByText('Started chat-server.')).toBeDefined();
    });
    await waitFor(() => {
      expect(mockNetworkGetStatus).toHaveBeenCalledTimes(2);
      expect(screen.getByText('running')).toBeDefined();
    });
  });

  it('shows service action error feedback when the follow-up status refresh fails', async () => {
    window.location.hash = '#/network';
    mockNetworkGetStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'running' }],
      })
      .mockRejectedValueOnce(new Error('status endpoint unavailable'));

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restart chat-server' }));

    await waitFor(() => {
      expect(mockNetworkRestart).toHaveBeenCalledWith('chat-server');
      expect(screen.getByRole('alert').textContent).toContain('Unable to restart chat-server: status endpoint unavailable');
    });
    await waitFor(() => expect(mockNetworkGetStatus).toHaveBeenCalledTimes(2));
  });

  it('waits for a superseding manual refresh before resolving stale service actions', async () => {
    window.location.hash = '#/network';
    const actionStatus = deferred<{ mode: 'secure'; secureBackend: 'local-encrypted'; services: Array<{ id: string; status: string }> }>();
    const manualStatus = deferred<{ mode: 'secure'; secureBackend: 'local-encrypted'; services: Array<{ id: string; status: string }> }>();
    mockNetworkGetStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'running' }],
      })
      .mockReturnValueOnce(actionStatus.promise)
      .mockReturnValueOnce(manualStatus.promise);

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restart chat-server' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    act(() => {
      actionStatus.resolve({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'running' }],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Restarting chat-server…')).toBeDefined();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    act(() => {
      manualStatus.resolve({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'running' }],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Restarted chat-server.')).toBeDefined();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('surfaces network status refresh failures before selected service logs settle', async () => {
    window.location.hash = '#/network';
    const slowLogs = deferred<{ logs: string[] }>();
    mockNetworkGetStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat-server', status: 'running' }],
      })
      .mockRejectedValueOnce(new Error('status endpoint unavailable'));
    mockNetworkGetLogs
      .mockResolvedValueOnce({ logs: ['current log line'] })
      .mockReturnValueOnce(slowLogs.promise);

    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    await screen.findByLabelText('Service logs');
    fireEvent.change(screen.getByLabelText('Service logs'), { target: { value: 'chat-server' } });
    await screen.findByText('current log line');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Unable to refresh network status: status endpoint unavailable');
    });
    expect(screen.getByText('Loading logs for the selected service...')).toBeDefined();

    act(() => {
      slowLogs.resolve({ logs: ['slow refreshed log line'] });
    });

    await waitFor(() => {
      expect(screen.getByText('slow refreshed log line')).toBeDefined();
    });
  });

  it('shows connection and session status in the top bar', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);
    const topbar = container.querySelector('.topbar');

    expect(topbar?.textContent).toContain('connected');
    expect(topbar?.textContent).toContain('sess-1');
    expect(topbar?.textContent).toContain('test-project');
  });

  it('exposes an accessible mobile navigation drawer toggle', async () => {
    const mediaQueryList = {
      matches: true,
      media: '(max-width: 920px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryList));

    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' });
    const sidebar = container.querySelector<HTMLElement>('#dashboard-sidebar');

    expect(toggle.getAttribute('aria-controls')).toBe('dashboard-sidebar');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('class')).toContain('button');
    expect(sidebar?.getAttribute('aria-hidden')).toBe('true');
    expect(sidebar?.hasAttribute('inert')).toBe(true);

    fireEvent.click(toggle);

    const openSidebar = container.querySelector<HTMLElement>('#dashboard-sidebar');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(openSidebar?.getAttribute('aria-hidden')).toBeNull();
    expect(openSidebar?.hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Dispatch' }).getAttribute('class')).toContain('button--primary');
    expect(screen.getByRole('button', { name: 'Reject' }).getAttribute('class')).toContain('button--secondary');

    const closeButton = screen.getByRole('button', { name: 'Close navigation menu' });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));

    const sidebarLinks = Array.from(openSidebar?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []);
    const lastSidebarLink = sidebarLinks.at(-1);
    const focusGuards = Array.from(openSidebar?.querySelectorAll<HTMLElement>('.sidebar__focus-guard') ?? []);

    lastSidebarLink?.focus();
    focusGuards[1]?.focus();
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    focusGuards[0]?.focus();
    expect(document.activeElement).toBe(lastSidebarLink);

    fireEvent.click(closeButton);
    await waitFor(() => expect(document.activeElement).toBe(toggle));
    expect(sidebar?.getAttribute('aria-hidden')).toBe('true');
    expect(sidebar?.hasAttribute('inert')).toBe(true);
  });

  it('renders agent list on the beasts page', async () => {
    window.location.hash = '#/beasts';
    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeDefined();
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Beasts' })).toBeDefined();
    expect(mockListAgents).toHaveBeenCalled();
  });

  it('refreshes the beasts fleet after Create Agent auto-dispatch failures', async () => {
    window.location.hash = '#/beasts';
    mockCreateAgent.mockRejectedValueOnce(new BeastApiError(
      "Dispatch failed for tracked agent 'agent-failed': outputDir is required",
      409,
      'AGENT_DISPATCH_FAILED',
      { agentId: 'agent-failed' },
    ));

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('agent-1').length).toBeGreaterThan(0);
    });
    const initialListCalls = mockListAgents.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /^\+ create agent$/i }));
    act(() => {
      useBeastStore.getState().setStepValues(0, { name: 'Dispatch Failure Agent' });
      useBeastStore.getState().setStepValues(1, {
        workflowType: 'martin-loop',
        provider: 'codex',
        objective: 'Implement chunks',
        chunkDirectory: 'tasks/chunks',
      });
      useBeastStore.setState({ wizardStep: 7, highestCompleted: 6 });
    });

    fireEvent.click(screen.getByRole('button', { name: /launch agent/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Dispatch failed for tracked agent');
    });
    await waitFor(() => {
      expect(mockListAgents.mock.calls.length).toBeGreaterThan(initialListCalls);
    });
  });

  it('keeps deleted audit rows from being auto-selected on the beasts page', async () => {
    window.location.hash = '#/beasts';
    const deletedAgent = {
      id: 'agent-deleted',
      definitionId: 'chunk-plan',
      status: 'deleted',
      source: 'chat',
      createdByUser: 'chat-session:sess-1',
      initAction: {
        kind: 'chunk-plan',
        command: '/plan --design-doc docs/plans/deleted.md',
        config: { designDocPath: 'docs/plans/deleted.md' },
        chatSessionId: 'sess-1',
      },
      initConfig: { designDocPath: 'docs/plans/deleted.md' },
      chatSessionId: 'sess-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:03.000Z',
    };
    const activeAgent = {
      ...deletedAgent,
      id: 'agent-active',
      status: 'stopped',
      updatedAt: '2026-03-11T00:00:02.000Z',
    };
    mockListAgents.mockResolvedValue([deletedAgent, activeAgent]);
    mockGetAgent.mockImplementation(async (agentId: string) => ({
      agent: agentId === 'agent-active' ? activeAgent : deletedAgent,
      events: [],
    }));

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-deleted')).toBeDefined();
      expect(screen.getByText('agent-active')).toBeDefined();
      expect(mockGetAgent).toHaveBeenCalledWith('agent-active');
    });
    expect(mockGetAgent).not.toHaveBeenCalledWith('agent-deleted');
  });

  it('applies Beast SSE status and log updates incrementally', async () => {
    window.location.hash = '#/beasts';
    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
      expect(screen.getAllByText('agent-1').length).toBeGreaterThan(0);
      expect(screen.getByText(/started from chat/)).toBeDefined();
    });

    latestBeastEventHandlers?.agentStatus?.({
      agentId: 'agent-1',
      status: 'running',
      updatedAt: '2026-03-11T00:00:03.000Z',
    });
    latestBeastEventHandlers?.runLog?.({
      runId: 'run-1',
      attemptId: 'attempt-1',
      stream: 'stdout',
      line: 'container line 1',
      createdAt: '2026-03-11T00:00:04.000Z',
    });
    latestBeastEventHandlers?.runStatus?.({
      runId: 'run-1',
      status: 'completed',
      updatedAt: '2026-03-11T00:00:05.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText(/container line 1/)).toBeDefined();
      expect(screen.getAllByText('running').length).toBeGreaterThan(0);
      expect(screen.getByText('completed')).toBeDefined();
    });
  });

  it('deduplicates live log events already returned by the REST log load', async () => {
    window.location.hash = '#/beasts';
    const persistedLine = JSON.stringify({
      stream: 'stdout',
      message: 'container line 1',
      createdAt: '2026-03-11T00:00:04.000Z',
    });
    mockGetLogs.mockResolvedValue([persistedLine]);

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/container line 1/)).toBeDefined();
    });

    latestBeastEventHandlers?.runLog?.({
      eventId: 'log-event-1',
      runId: 'run-1',
      attemptId: 'attempt-1',
      stream: 'stdout',
      line: 'container line 1',
      createdAt: '2026-03-11T00:00:04.000Z',
    });

    await waitFor(() => {
      expect(screen.getAllByText(/container line 1/)).toHaveLength(1);
    });
  });

  it('does not deduplicate distinct log records that share timestamp and contents', async () => {
    window.location.hash = '#/beasts';
    mockGetLogs.mockResolvedValue([]);

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
    });

    latestBeastEventHandlers?.runLog?.({
      eventId: 'log-event-1',
      runId: 'run-1',
      attemptId: 'attempt-1',
      stream: 'stdout',
      line: 'same line',
      createdAt: '2026-03-11T00:00:04.000Z',
    });
    latestBeastEventHandlers?.runLog?.({
      eventId: 'log-event-2',
      runId: 'run-1',
      attemptId: 'attempt-1',
      stream: 'stdout',
      line: 'same line',
      createdAt: '2026-03-11T00:00:04.000Z',
    });

    await waitFor(() => {
      expect(screen.getAllByText(/same line/)).toHaveLength(2);
    });
  });

  it('refreshes the agent list when SSE reports an unknown agent', async () => {
    window.location.hash = '#/beasts';

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeDefined();
    });

    mockListAgents.mockResolvedValue([
      {
        id: 'agent-1',
        definitionId: 'chunk-plan',
        status: 'dispatching',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: { kind: 'chunk-plan', command: '/plan --design-doc docs/plans/design.md', config: {}, chatSessionId: 'sess-1' },
        initConfig: {},
        chatSessionId: 'sess-1',
        dispatchRunId: 'run-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
      {
        id: 'agent-2',
        definitionId: 'chunk-plan',
        status: 'running',
        source: 'dashboard',
        createdByUser: 'operator',
        initAction: { kind: 'chunk-plan', command: '/plan --design-doc docs/next.md', config: {}, chatSessionId: 'sess-1' },
        initConfig: {},
        chatSessionId: 'sess-1',
        dispatchRunId: 'run-2',
        createdAt: '2026-03-11T00:00:02.000Z',
        updatedAt: '2026-03-11T00:00:03.000Z',
      },
    ]);

    latestBeastEventHandlers?.agentStatus?.({
      agentId: 'agent-2',
      status: 'running',
      updatedAt: '2026-03-11T00:00:03.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText('agent-2')).toBeDefined();
    });
  });

  it('refreshes selected agent details when a newly linked run emits logs', async () => {
    window.location.hash = '#/beasts';
    mockListAgents.mockResolvedValue([
      {
        id: 'agent-1',
        definitionId: 'chunk-plan',
        status: 'dispatching',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: { kind: 'chunk-plan', command: '/plan --design-doc docs/plans/design.md', config: {}, chatSessionId: 'sess-1' },
        initConfig: {},
        chatSessionId: 'sess-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
    ]);
    mockGetAgent.mockResolvedValue({
      agent: {
        id: 'agent-1',
        definitionId: 'chunk-plan',
        status: 'dispatching',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: { kind: 'chunk-plan', command: '/plan --design-doc docs/plans/design.md', config: {}, chatSessionId: 'sess-1' },
        initConfig: {},
        chatSessionId: 'sess-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
      events: [],
    });

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain('No events or logs yet');
    });

    mockGetAgent.mockResolvedValue({
      agent: {
        id: 'agent-1',
        definitionId: 'chunk-plan',
        status: 'running',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: { kind: 'chunk-plan', command: '/plan --design-doc docs/plans/design.md', config: {}, chatSessionId: 'sess-1' },
        initConfig: {},
        chatSessionId: 'sess-1',
        dispatchRunId: 'run-2',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:03.000Z',
      },
      events: [],
    });
    mockGetRun.mockResolvedValue({
      run: {
        id: 'run-2',
        definitionId: 'chunk-plan',
        status: 'running',
        dispatchedBy: 'chat',
        dispatchedByUser: 'chat-session:sess-1',
        attemptCount: 1,
        createdAt: '2026-03-11T00:00:02.000Z',
      },
      attempts: [],
      events: [],
    });
    mockGetLogs.mockResolvedValue(['linked run log']);

    latestBeastEventHandlers?.agentEvent?.({
      agentId: 'agent-1',
      event: {
        id: 'agent-event-1',
        sequence: 1,
        level: 'info',
        type: 'agent.dispatch.linked',
        message: 'Dispatch run linked',
        payload: { runId: 'run-2' },
        createdAt: '2026-03-11T00:00:03.000Z',
      },
    });

    latestBeastEventHandlers?.runLog?.({
      eventId: 'log-event-1',
      runId: 'run-2',
      attemptId: 'attempt-2',
      stream: 'stdout',
      line: 'linked run log',
      createdAt: '2026-03-11T00:00:04.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText(/linked run log/)).toBeDefined();
    });
  });

  it('renders stopped agents in the beasts list', async () => {
    window.location.hash = '#/beasts';
    mockListAgents.mockResolvedValue([
      {
        id: 'agent-1',
        definitionId: 'chunk-plan',
        status: 'stopped',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: {
          kind: 'chunk-plan',
          command: '/plan --design-doc docs/plans/design.md',
          config: { designDocPath: 'docs/plans/design.md' },
          chatSessionId: 'sess-1',
        },
        initConfig: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
        dispatchRunId: 'run-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
    ]);
    mockGetAgent.mockResolvedValue({
      agent: {
        id: 'agent-1',
        definitionId: 'chunk-plan',
        status: 'stopped',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: {
          kind: 'chunk-plan',
          command: '/plan --design-doc docs/plans/design.md',
          config: { designDocPath: 'docs/plans/design.md' },
          chatSessionId: 'sess-1',
        },
        initConfig: { designDocPath: 'docs/plans/design.md' },
        chatSessionId: 'sess-1',
        dispatchRunId: 'run-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
      events: [],
    });

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeDefined();
    });
  });

  it('disables create-agent entry points when Beast API state cannot load', async () => {
    window.location.hash = '#/beasts';
    mockGetCatalog.mockRejectedValue(new Error('Beast API not available'));

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Beast API not available').length).toBeGreaterThan(0);
    });

    const headerCreateButton = screen.getByRole('button', { name: /^\+ create agent$/i });
    const emptyStateCreateButton = screen.getByRole('button', { name: /create your first agent/i });

    expect(headerCreateButton.hasAttribute('disabled')).toBe(true);
    expect(emptyStateCreateButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(emptyStateCreateButton);
    expect(screen.queryByText('Identity')).toBeNull();
  });

  it('keeps create-agent enabled for non-creation Beast event errors after state loads', async () => {
    window.location.hash = '#/beasts';

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeDefined();
    });

    latestBeastEventHandlers?.error?.(new Error('SSE disconnected'));

    await waitFor(() => {
      expect(screen.getByText('SSE disconnected')).toBeDefined();
    });

    const headerCreateButton = screen.getByRole('button', { name: /^\+ create agent$/i });
    expect(headerCreateButton.hasAttribute('disabled')).toBe(false);
  });

  it('keeps create-agent enabled when selected agent detail fails after state loads', async () => {
    window.location.hash = '#/beasts';
    mockGetAgent.mockRejectedValue(new Error('Agent detail unavailable'));

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Agent detail unavailable')).toBeDefined();
    });

    const headerCreateButton = screen.getByRole('button', { name: /^\+ create agent$/i });
    expect(headerCreateButton.hasAttribute('disabled')).toBe(false);
  });

  it('renders initializing agents in the beasts list', async () => {
    window.location.hash = '#/beasts';
    mockListAgents.mockResolvedValue([
      {
        id: 'agent-init',
        definitionId: 'design-interview',
        status: 'initializing',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: {
          kind: 'design-interview',
          command: '/interview',
          config: { goal: 'Design flow' },
          chatSessionId: 'sess-1',
        },
        initConfig: { goal: 'Design flow' },
        chatSessionId: 'sess-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
    ]);
    mockGetAgent.mockResolvedValue({
      agent: {
        id: 'agent-init',
        definitionId: 'design-interview',
        status: 'initializing',
        source: 'chat',
        createdByUser: 'chat-session:sess-1',
        initAction: {
          kind: 'design-interview',
          command: '/interview',
          config: { goal: 'Design flow' },
          chatSessionId: 'sess-1',
        },
        initConfig: { goal: 'Design flow' },
        chatSessionId: 'sess-1',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:01.000Z',
      },
      events: [],
    });

    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-init')).toBeDefined();
    });
  });
});
