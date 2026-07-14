import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInitAction, ChatShell, resolveWizardDefinitionId } from './chat-shell';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  launchConfig: {
    executionMode: 'process',
    workflow: {
      workflowType: 'martin-loop',
      provider: 'codex',
      objective: 'Implement chunks',
    },
  },
}));

const networkApiMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getLogs: vi.fn(),
  getStatus: vi.fn(),
  restart: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock('../hooks/use-chat-session', () => ({
  useChatSession: () => ({
    activity: [],
    approve: vi.fn(),
    approvalError: null,
    approvalResolving: false,
    clearedFailedDraft: undefined,
    connectionStatus: 'connected',
    costUsd: 0,
    dismissError: vi.fn(),
    errorBanners: [],
    messages: [],
    pendingApproval: null,
    projectId: 'default',
    reconnect: vi.fn(),
    retryError: vi.fn(),
    retryMessage: vi.fn(),
    send: vi.fn(),
    sessionId: 'session-1',
    showTypingIndicator: false,
    status: 'idle',
    tier: 'standard',
    tokenTotals: { input: 0, output: 0, total: 0 },
  }),
}));

vi.mock('../lib/api', () => ({
  ChatApiClient: class {
    listSessions = vi.fn().mockResolvedValue([]);
    listSessionsWithDiagnostics = vi.fn().mockResolvedValue({ sessions: [], corruptSessions: [] });
  },
}));

vi.mock('../lib/network-api', () => ({
  NetworkApiClient: class {
    getStatus = networkApiMocks.getStatus;
    getConfig = networkApiMocks.getConfig;
    getLogs = networkApiMocks.getLogs;
    restart = networkApiMocks.restart;
    start = networkApiMocks.start;
    stop = networkApiMocks.stop;
    updateConfig = networkApiMocks.updateConfig;
  },
}));

vi.mock('../lib/beast-api', () => ({
  BeastApiClient: class {
    createAgent = mocks.createAgent;
    getCatalog = vi.fn().mockResolvedValue([]);
    getContainerRuntimeStatus = vi.fn().mockResolvedValue(undefined);
    listCatalog = vi.fn().mockResolvedValue([]);
    listAgents = vi.fn().mockResolvedValue([]);
    listRuns = vi.fn().mockResolvedValue([]);
    getContainerRuntime = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(() => undefined);
    subscribeToEvents = vi.fn().mockResolvedValue(() => undefined);
  },
}));

vi.mock('../lib/analytics-api', () => ({
  AnalyticsApiClient: class {},
}));

vi.mock('../lib/dashboard-api', () => ({
  DashboardApiClient: class {},
}));

vi.mock('../pages/dashboard-page', () => ({
  DashboardPage: () => <div>Dashboard module</div>,
}));

vi.mock('../pages/beasts-page', () => ({
  BeastsPage: ({
    disabled,
    onLaunch,
  }: {
    disabled?: boolean;
    onLaunch: (config: Record<string, unknown>) => Promise<void>;
  }) => (
    <button type="button" disabled={disabled} onClick={() => { void onLaunch(mocks.launchConfig); }}>Launch test Beast</button>
  ),
}));

vi.mock('../pages/analytics-page', () => ({
  AnalyticsPage: () => <div>Analytics module</div>,
}));

vi.mock('./transcript-pane', () => ({
  TranscriptPane: () => <div>Transcript</div>,
}));

vi.mock('./composer', () => ({
  Composer: () => <form aria-label="Composer" />,
}));

vi.mock('./activity-pane', () => ({
  ActivityPane: () => <div>Activity</div>,
}));

vi.mock('./approval-card', () => ({
  ApprovalCard: () => <div>Approvals</div>,
}));

vi.mock('./cost-badge', () => ({
  CostBadge: () => <div>Cost Summary</div>,
}));

describe('ChatShell route heading', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.createAgent.mockReset();
    mocks.createAgent.mockResolvedValue({ id: 'agent-1' });
    window.location.hash = '#/network';
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.clearAllMocks();
    for (const mock of Object.values(networkApiMocks)) {
      mock.mockReset();
    }
    networkApiMocks.getStatus.mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    networkApiMocks.getConfig.mockResolvedValue({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
    });
    networkApiMocks.getLogs.mockResolvedValue({ logs: [] });
    networkApiMocks.restart.mockResolvedValue(undefined);
    networkApiMocks.start.mockResolvedValue(undefined);
    networkApiMocks.stop.mockResolvedValue(undefined);
    networkApiMocks.updateConfig.mockResolvedValue({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
    });
  });

  it('uses the active route label as the primary heading and demotes project context to metadata', () => {
    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Network' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'default' })).toBeNull();
    expect(screen.getByText('Project: default')).toBeTruthy();
    expect(screen.getByText('Service controls')).toBeTruthy();
    expect(screen.queryByText('Chat is the only live section in this first Frankenbeast dashboard cut.')).toBeNull();
  });

  it('keeps placeholder modules out of the primary dashboard navigation', () => {
    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);

    const navigation = within(screen.getByRole('navigation', { name: 'Dashboard navigation' }));
    expect(navigation.getByRole('link', { name: /Overview/ })).toBeTruthy();
    expect(navigation.getByRole('link', { name: /Chat/ })).toBeTruthy();
    expect(navigation.getByRole('link', { name: /Beasts/ })).toBeTruthy();
    expect(navigation.getByRole('link', { name: /Network/ })).toBeTruthy();
    expect(navigation.getByRole('link', { name: /Analytics/ })).toBeTruthy();

    expect(navigation.queryByRole('link', { name: /Sessions/ })).toBeNull();
    expect(navigation.queryByRole('link', { name: /Costs/ })).toBeNull();
    expect(navigation.queryByRole('link', { name: /Safety/ })).toBeNull();
    expect(navigation.queryByRole('link', { name: /Settings/ })).toBeNull();
    expect(navigation.queryByText('Soon')).toBeNull();
  });

  it('redirects direct placeholder hashes back to the live chat route', () => {
    window.location.hash = '#/sessions';

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Chat' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Sessions' })).toBeNull();
    expect(window.location.hash).toBe('#/chat');
  });

  it('preserves the selected chat session when launching the default martin-loop Beast workflow', async () => {
    window.location.hash = '#/beasts';

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" sessionId="chat-session-42" version="0.2.1" />);
    const launchButton = await screen.findByRole('button', { name: 'Launch test Beast' });
    expect((launchButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(launchButton);

    await waitFor(() => expect(mocks.createAgent).toHaveBeenCalledTimes(1));
    expect(mocks.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'martin-loop',
      chatSessionId: 'chat-session-42',
      initAction: expect.objectContaining({
        kind: 'martin-loop',
        chatSessionId: 'chat-session-42',
      }),
    }));
  });

  it('falls back to the active chat session when launching the default martin-loop Beast workflow', async () => {
    window.location.hash = '#/beasts';

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    const launchButton = await screen.findByRole('button', { name: 'Launch test Beast' });
    expect((launchButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(launchButton);

    await waitFor(() => expect(mocks.createAgent).toHaveBeenCalledTimes(1));
    expect(mocks.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'martin-loop',
      chatSessionId: 'session-1',
      initAction: expect.objectContaining({
        kind: 'martin-loop',
        chatSessionId: 'session-1',
      }),
    }));
  });

  it('surfaces a failed network refresh instead of leaving stale status silently visible', async () => {
    networkApiMocks.getStatus
      .mockResolvedValueOnce({ mode: 'secure', secureBackend: 'local-encrypted', services: [] })
      .mockRejectedValueOnce(new Error('HTTP 503'));

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to refresh network status: HTTP 503');
  });

  it('refreshes both network status and config from the Network page', async () => {
    networkApiMocks.getStatus.mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    networkApiMocks.getConfig
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      })
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'refreshed-model', enabled: true, host: '127.0.0.1', port: 3737 },
      });

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue('initial-model')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(2));
    expect(screen.getByDisplayValue('refreshed-model')).toBeDefined();
  });

  it('ignores stale config refresh responses after a newer refresh succeeds', async () => {
    let resolveStaleConfig!: (value: unknown) => void;
    networkApiMocks.getStatus.mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    networkApiMocks.getConfig
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStaleConfig = resolve; }))
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'newer-model', enabled: true, host: '127.0.0.1', port: 3737 },
      });

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.getByDisplayValue('newer-model')).toBeDefined());
    resolveStaleConfig({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'stale-model', enabled: true, host: '127.0.0.1', port: 3737 },
    });

    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(3));
    expect(screen.getByDisplayValue('newer-model')).toBeDefined();
    expect(screen.queryByDisplayValue('stale-model')).toBeNull();
  });

  it('surfaces failed config refreshes from the Network page', async () => {
    networkApiMocks.getStatus.mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    networkApiMocks.getConfig
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      })
      .mockRejectedValueOnce(new Error('HTTP 503'));

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to refresh network config: HTTP 503');
  });

  it('keeps config refresh failures visible after status refresh succeeds', async () => {
    let resolveStatus!: (value: unknown) => void;
    networkApiMocks.getStatus
      .mockResolvedValueOnce({ mode: 'secure', secureBackend: 'local-encrypted', services: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStatus = resolve; }));
    networkApiMocks.getConfig
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      })
      .mockRejectedValueOnce(new Error('HTTP 503'));

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to refresh network config: HTTP 503');

    resolveStatus({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });

    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert').textContent).toContain('Unable to refresh network config: HTTP 503');
  });

  it('prevents stale config refreshes from overwriting a saved config response', async () => {
    let resolveStaleConfig!: (value: unknown) => void;
    networkApiMocks.getStatus.mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    networkApiMocks.getConfig
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStaleConfig = resolve; }));
    networkApiMocks.updateConfig.mockResolvedValue({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'saved-model', enabled: true, host: '127.0.0.1', port: 3737 },
    });

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'saved-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    await waitFor(() => expect(screen.getByDisplayValue('saved-model')).toBeDefined());
    resolveStaleConfig({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'stale-model', enabled: true, host: '127.0.0.1', port: 3737 },
    });

    expect(screen.getByDisplayValue('saved-model')).toBeDefined();
    expect(screen.queryByDisplayValue('stale-model')).toBeNull();
  });

  it('applies save responses even when a newer manual refresh resolves first', async () => {
    let resolveSave!: (value: unknown) => void;
    let resolveRefresh!: (value: unknown) => void;
    networkApiMocks.getStatus.mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    networkApiMocks.getConfig
      .mockResolvedValueOnce({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    networkApiMocks.updateConfig.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: 'saved-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(networkApiMocks.getConfig).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveRefresh({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'initial-model', enabled: true, host: '127.0.0.1', port: 3737 },
      });
    });

    await act(async () => {
      resolveSave({
        network: { mode: 'secure', secureBackend: 'local-encrypted' },
        chat: { model: 'saved-model', enabled: true, host: '127.0.0.1', port: 3737 },
      });
    });

    await waitFor(() => expect(screen.getByText('Saved network config changes.')).toBeTruthy());
    expect(screen.getByDisplayValue('saved-model')).toBeDefined();
    expect(screen.queryByDisplayValue('initial-model')).toBeNull();
    expect((screen.getByRole('button', { name: 'Save config' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ignores stale refresh failures after a newer network refresh succeeds', async () => {
    let rejectStaleRefresh!: (error: Error) => void;
    networkApiMocks.getStatus
      .mockResolvedValueOnce({ mode: 'secure', secureBackend: 'local-encrypted', services: [] })
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectStaleRefresh = reject;
      }))
      .mockResolvedValueOnce({ mode: 'insecure', secureBackend: 'local-encrypted', services: [] });

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);
    expect(await screen.findByText('insecure')).toBeTruthy();

    rejectStaleRefresh(new Error('HTTP 500'));

    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores stale manual refresh failures after a newer service action refresh succeeds', async () => {
    let rejectStaleRefresh!: (error: Error) => void;
    networkApiMocks.getStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      })
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectStaleRefresh = reject;
      }))
      .mockResolvedValueOnce({
        mode: 'insecure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      });

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    expect(await screen.findByText('chat')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart chat' }));

    expect(await screen.findByText('insecure')).toBeTruthy();

    await act(async () => {
      rejectStaleRefresh(new Error('HTTP 500'));
    });

    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores stale service action refresh failures after a newer manual refresh succeeds', async () => {
    let rejectStaleActionRefresh!: (error: Error) => void;
    networkApiMocks.getStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      })
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectStaleActionRefresh = reject;
      }))
      .mockResolvedValueOnce({
        mode: 'insecure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      });

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    expect(await screen.findByText('chat')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restart chat' }));
    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('insecure')).toBeTruthy();

    await act(async () => {
      rejectStaleActionRefresh(new Error('HTTP 500'));
    });

    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a stale service action refresh when the superseding manual refresh fails', async () => {
    let resolveStaleActionRefresh!: (status: { mode: string; secureBackend: string; services: Array<{ id: string; status: string; inProcess: boolean }> }) => void;
    networkApiMocks.getStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveStaleActionRefresh = resolve;
      }))
      .mockRejectedValueOnce(new Error('HTTP 503'));

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    expect(await screen.findByText('chat')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restart chat' }));
    await waitFor(() => expect(networkApiMocks.getStatus).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to refresh network status: HTTP 503');

    await act(async () => {
      resolveStaleActionRefresh({
        mode: 'insecure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Unable to restart chat'))).toBe(true);
    });
  });

  it('surfaces a service action failure when the follow-up status refresh is rejected', async () => {
    networkApiMocks.getStatus
      .mockResolvedValueOnce({
        mode: 'secure',
        secureBackend: 'local-encrypted',
        services: [{ id: 'chat', status: 'running', inProcess: false }],
      })
      .mockRejectedValueOnce(new Error('HTTP 502'));

    render(<ChatShell baseUrl="http://localhost:3737" projectId="default" version="0.2.1" />);
    expect(await screen.findByText('chat')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restart chat' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to restart chat: HTTP 502');
  });
});

 describe('buildInitAction', () => {
  it('carries chat session context for every supported Beast workflow', () => {
    const config = {
      designDocPath: 'docs/design.md',
      workflow: { docPath: 'docs/fallback.md' },
    };

    for (const definitionId of ['design-interview', 'chunk-plan', 'martin-loop']) {
      expect(buildInitAction(definitionId, config, 'chat-session-42')).toEqual(expect.objectContaining({
        kind: definitionId,
        chatSessionId: 'chat-session-42',
      }));
    }

  });

  it('rejects Create Agent wizard launch configs without an explicit workflow type', () => {
    expect(() => resolveWizardDefinitionId({})).toThrow('Workflow type is required before launching a Beast agent.');
    expect(() => resolveWizardDefinitionId({ workflow: { workflowType: '   ' } })).toThrow('Workflow type is required before launching a Beast agent.');
    expect(resolveWizardDefinitionId({ workflow: { workflowType: ' martin-loop ' } })).toBe('martin-loop');
  });
});
