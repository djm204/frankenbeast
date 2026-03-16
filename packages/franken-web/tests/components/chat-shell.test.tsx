import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatShell } from '../../src/components/chat-shell.js';

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
  MODULE_CONFIG_KEYS: ['firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat'],
  BeastApiClient: vi.fn(function (this: {
    getCatalog: typeof mockGetCatalog;
    listAgents: typeof mockListAgents;
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
    startRun: ReturnType<typeof vi.fn>;
    stopRun: ReturnType<typeof vi.fn>;
    killRun: ReturnType<typeof vi.fn>;
    restartRun: ReturnType<typeof vi.fn>;
  }) {
    this.getCatalog = mockGetCatalog;
    this.listAgents = mockListAgents;
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
    this.startRun = vi.fn().mockResolvedValue(undefined);
    this.stopRun = vi.fn().mockResolvedValue(undefined);
    this.killRun = vi.fn().mockResolvedValue(undefined);
    this.restartRun = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('../../src/lib/network-api.js', () => ({
  NetworkApiClient: vi.fn(function (this: { getStatus: ReturnType<typeof vi.fn>; getConfig: ReturnType<typeof vi.fn> }) {
    this.getStatus = vi.fn().mockResolvedValue({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      services: [],
    });
    this.getConfig = vi.fn().mockResolvedValue({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
    });
  }),
}));

afterEach(() => {
  cleanup();
  window.location.hash = '';
  vi.clearAllMocks();
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
});

describe('ChatShell', () => {
  it('renders Frankenbeast branding and keeps the version in the sidebar footer', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);
    const nav = container.querySelector('[aria-label="Dashboard navigation"]');
    const brand = container.querySelector('.sidebar__brand');
    const footer = container.querySelector('.sidebar__footer');

    expect(footer?.textContent).toContain('v0.9.0');
    expect(brand?.textContent).not.toContain('v0.9.0');
    expect(nav?.textContent).toContain('Chat');
    expect(nav?.textContent).toContain('Beasts');
    expect(nav?.textContent).toContain('Sessions');
    expect(nav?.textContent).toContain('Analytics');
  });

  it('renders the chat workspace inside the dashboard shell', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    expect(screen.getByText('Dispatch accepted.')).toBeDefined();
    expect(screen.getByLabelText('Conversation')).toBeDefined();
    expect(screen.getByRole('textbox')).toBeDefined();
    expect(screen.getByText('Approve deploy')).toBeDefined();
    expect(screen.getByText('turn.execution.start')).toBeDefined();
  });

  it('shows connection and session status in the top bar', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);
    const topbar = container.querySelector('.topbar');

    expect(topbar?.textContent).toContain('connected');
    expect(topbar?.textContent).toContain('sess-1');
    expect(topbar?.textContent).toContain('test-project');
  });

  it('exposes an accessible mobile navigation drawer toggle', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    const toggle = screen.getByRole('button', { name: 'Open navigation menu' });

    expect(toggle.getAttribute('aria-controls')).toBe('dashboard-sidebar');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('class')).toContain('button');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Dispatch' }).getAttribute('class')).toContain('button--primary');
    expect(screen.getByRole('button', { name: 'Reject' }).getAttribute('class')).toContain('button--secondary');
  });

  it('renders agent list on the beasts page', async () => {
    window.location.hash = '#/beasts';
    render(
      <ChatShell
        baseUrl="http://localhost:3000"
        beastOperatorToken="operator-token"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeDefined();
    });

    expect(screen.getByRole('heading', { name: 'Beasts' })).toBeDefined();
    expect(mockListAgents).toHaveBeenCalled();
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
        beastOperatorToken="operator-token"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-1')).toBeDefined();
    });
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
        beastOperatorToken="operator-token"
        projectId="test-project"
        version="0.9.0"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('agent-init')).toBeDefined();
    });
  });
});
