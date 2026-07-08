import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatShell } from './chat-shell';

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
  },
}));

vi.mock('../lib/network-api', () => ({
  NetworkApiClient: class {
    getStatus = vi.fn().mockResolvedValue({ mode: 'secure', secureBackend: 'local-encrypted', services: [] });
    getConfig = vi.fn().mockResolvedValue({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
    });
    getLogs = vi.fn().mockResolvedValue({ logs: [] });
    restart = vi.fn().mockResolvedValue(undefined);
    updateConfig = vi.fn().mockResolvedValue({
      network: { mode: 'secure', secureBackend: 'local-encrypted' },
      chat: { model: 'claude-sonnet-4-6', enabled: true, host: '127.0.0.1', port: 3737 },
    });
  },
}));

vi.mock('../lib/beast-api', () => ({
  BeastApiClient: class {
    listCatalog = vi.fn().mockResolvedValue([]);
    listAgents = vi.fn().mockResolvedValue([]);
    listRuns = vi.fn().mockResolvedValue([]);
    getContainerRuntime = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(() => undefined);
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
  BeastsPage: () => <div>Beasts module</div>,
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
    window.location.hash = '#/network';
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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
});
