import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SmartSwarmPage } from './smart-swarm-page';
import { SmartSwarmApiError } from '../lib/smart-swarm-api';
import type {
  RuntimeProvider,
  RuntimeSnapshot,
  SmartSwarmApiClient,
} from '../lib/smart-swarm-api';

const provider: RuntimeProvider = {
  id: 'hermes',
  runtime: 'hermes',
  displayName: 'Hermes',
  health: { state: 'connected', checkedAt: '2026-07-26T18:00:00.000Z' },
  capabilities: {
    snapshot: { status: 'supported' },
    streaming: { status: 'supported' },
    logs: { status: 'supported' },
    blockers: { status: 'supported' },
    approvals: { status: 'supported' },
    pause: { status: 'unsupported', reason: 'Pause is not supported by Hermes.' },
    resume: { status: 'unsupported', reason: 'Resume is not supported by Hermes.' },
    cancellation: { status: 'unsupported', reason: 'Cancellation is not supported by Hermes.' },
    policyActions: { status: 'unsupported', reason: 'Policy actions are not supported by Hermes.' },
  },
};

const snapshot: RuntimeSnapshot = {
  providerId: 'hermes',
  state: 'ready',
  capturedAt: '2026-07-26T18:00:02.000Z',
  workspaces: {
    status: 'available',
    data: [{ id: 'board-main', name: 'Main board', kind: 'board', state: 'available' }],
  },
  agents: {
    status: 'available',
    data: [
      { id: 'pm-1', workspaceId: 'board-main', displayName: 'PM Ada', state: 'running', lastActiveAt: '2026-07-26T18:00:01.000Z', metadata: { role: 'pm' } },
      { id: 'worker-1', workspaceId: 'board-main', displayName: 'Worker Lin', state: 'blocked', lastActiveAt: '2026-07-26T17:59:59.000Z', metadata: { role: 'worker' } },
    ],
  },
  tasks: {
    status: 'available',
    data: [
      {
        id: 'task-root', workspaceId: 'board-main', title: 'Contract root', state: 'succeeded', parentIds: [], dependencyIds: [], ownerIds: ['pm-1'], priority: 1,
        createdAt: '2026-07-26T17:00:00.000Z', updatedAt: '2026-07-26T17:30:00.000Z',
      },
      {
        id: 'task-live', workspaceId: 'board-main', title: 'Live dashboard', state: 'blocked', parentIds: ['task-root'], dependencyIds: ['task-root'], ownerIds: ['worker-1'], priority: 2,
        createdAt: '2026-07-26T17:31:00.000Z', updatedAt: '2026-07-26T18:00:00.000Z',
      },
    ],
  },
  runs: {
    status: 'available',
    data: [{
      id: 'run-1', workspaceId: 'board-main', taskId: 'task-live', agentId: 'worker-1', sessionId: 'session-1', state: 'blocked',
      startedAt: '2026-07-26T17:40:00.000Z', finishedAt: null, lastActiveAt: '2026-07-26T18:00:00.000Z', summary: 'Waiting for review',
    }],
  },
  events: {
    status: 'available',
    data: [{
      id: 'event-1', cursor: 'cursor-1', workspaceId: 'board-main', taskId: 'task-live', runId: 'run-1', type: 'log',
      occurredAt: '2026-07-26T18:00:00.000Z', summary: 'Focused tests passed',
    }],
  },
  blockers: {
    status: 'available',
    data: [{ id: 'blocker-1', workspaceId: 'board-main', taskId: 'task-live', category: 'dependency', summary: 'Waiting for contract', createdAt: '2026-07-26T17:50:00.000Z' }],
  },
  approvals: {
    status: 'available',
    data: [{ id: 'approval-1', workspaceId: 'board-main', taskId: 'task-live', state: 'pending', summary: 'Approve publication', createdAt: '2026-07-26T17:55:00.000Z', resolvedAt: null }],
  },
};

function createClient(overrides: Partial<SmartSwarmApiClient> = {}): SmartSwarmApiClient {
  return {
    listProviders: vi.fn().mockResolvedValue([provider]),
    fetchSnapshot: vi.fn().mockResolvedValue(snapshot),
    subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, handlers) => {
      handlers.connection?.('connected');
      return vi.fn();
    }),
    ...overrides,
  } as unknown as SmartSwarmApiClient;
}

afterEach(cleanup);

describe('SmartSwarmPage', () => {
  it('renders normalized provider, workspace, topology, and real evidence', async () => {
    const client = createClient();
    render(<SmartSwarmPage client={client} />);

    expect(screen.getByRole('status').textContent).toContain('Loading smart-swarm');
    await screen.findByText('Live dashboard');

    expect(screen.getByLabelText('Runtime provider')).toHaveProperty('value', 'hermes');
    expect(screen.getByLabelText('Workspace')).toHaveProperty('value', 'board-main');
    expect(screen.getByText('PM Ada')).toBeDefined();
    expect(screen.getByText('Worker Lin')).toBeDefined();
    expect(screen.getByText('Depends on Contract root')).toBeDefined();
    expect(screen.getByText('Focused tests passed')).toBeDefined();
    expect(screen.getByText('Waiting for contract')).toBeDefined();
    expect(screen.getByText('Approve publication')).toBeDefined();
    expect(await screen.findByText('Live · connected')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Live dashboard details' })).toBeDefined());
    expect(screen.getByText('run-1')).toBeDefined();
    expect(screen.getByText('Waiting for review')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pause task' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Pause is not supported by Hermes.')).toBeDefined();
  });

  it('moves focus into task details and restores it to the inspect trigger', async () => {
    render(<SmartSwarmPage client={createClient()} />);
    const inspect = await screen.findByRole('button', { name: 'Inspect Live dashboard' });
    inspect.focus();

    fireEvent.click(inspect);

    const close = screen.getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    inspect.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(inspect));
  });

  it('keeps advertised lifecycle controls disabled until mutations are wired', async () => {
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          pause: { status: 'supported' },
          resume: { status: 'supported' },
          cancellation: { status: 'supported' },
        },
      }]),
    })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    expect(screen.getByRole('button', { name: 'Pause task' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Resume task' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel task' })).toHaveProperty('disabled', true);
    expect(screen.getAllByText('This control is not wired to a runtime mutation yet.')).toHaveLength(3);
  });

  it('names the selected provider in a truthful empty state', async () => {
    const emptySnapshot: RuntimeSnapshot = {
      ...snapshot,
      state: 'empty',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'available', data: [] },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(emptySnapshot) })} />);

    expect(await screen.findByText('No runtime work in Hermes')).toBeDefined();
    expect(screen.getByText(/No demo data has been substituted/)).toBeDefined();
  });

  it('identifies an empty snapshot as workspace-scoped', async () => {
    const emptyWorkspaceSnapshot: RuntimeSnapshot = {
      ...snapshot,
      state: 'empty',
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(emptyWorkspaceSnapshot) })} />);

    expect(await screen.findByText('No runtime work in Main board')).toBeDefined();
    expect(screen.getByText(/selected workspace reported no tasks/)).toBeDefined();
  });

  it('shows degraded runtime evidence without hiding available sections', async () => {
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({ ...snapshot, state: 'degraded', message: 'Approvals are temporarily unreadable.' }),
    })} />);

    expect(await screen.findByText('Live state is degraded')).toBeDefined();
    expect(screen.getByText('Approvals are temporarily unreadable.')).toBeDefined();
    expect(screen.getByText('Live dashboard')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Provider capabilities' }).textContent).toContain('degraded');
  });

  it('ranks recent blockers and pending approvals before bounding evidence', async () => {
    const blockers = Array.from({ length: 101 }, (_, index) => ({
      id: `blocker-${index}`,
      workspaceId: 'board-main',
      taskId: 'task-live',
      category: 'dependency' as const,
      summary: index === 100 ? 'Newest blocker' : `Old blocker ${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 26, 0, index)).toISOString(),
    }));
    const approvals = Array.from({ length: 101 }, (_, index) => ({
      id: `approval-${index}`,
      workspaceId: 'board-main',
      taskId: 'task-live',
      state: index === 100 ? 'pending' as const : 'approved' as const,
      summary: index === 100 ? 'Pending latest approval' : `Resolved approval ${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 26, 0, index)).toISOString(),
      resolvedAt: index === 100 ? null : new Date(Date.UTC(2026, 6, 26, 1, index)).toISOString(),
    }));
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        blockers: { status: 'available', data: blockers },
        approvals: { status: 'available', data: approvals },
      }),
    })} />);

    expect(await screen.findByText('Newest blocker')).toBeDefined();
    expect(screen.getByText('Pending latest approval')).toBeDefined();
    expect(screen.queryByText('Old blocker 0')).toBeNull();
    expect(screen.queryByText('Resolved approval 0')).toBeNull();
  });

  it('renders an explicit normalized loading snapshot state', async () => {
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({ ...snapshot, state: 'loading' }),
    })} />);

    expect(await screen.findByText('Runtime state is loading')).toBeDefined();
  });

  it('distinguishes unsupported schemas from runtime unavailability', async () => {
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({ ...snapshot, state: 'schema-incompatible', message: 'Hermes schema 99 is unsupported.' }),
    })} />);
    expect(await screen.findByText('Runtime schema unsupported')).toBeDefined();

    cleanup();
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({ ...snapshot, state: 'unavailable', message: 'Hermes database is offline.' }),
    })} />);
    expect(await screen.findByText('Hermes is unavailable')).toBeDefined();
    expect(screen.getByText('Hermes database is offline.')).toBeDefined();
  });

  it('surfaces unsupported workspace and run sections', async () => {
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        workspaces: { status: 'unsupported', reason: 'Workspace discovery is unavailable.' },
        runs: { status: 'unsupported', reason: 'Run evidence is unavailable.' },
      }),
    })} />);

    expect(await screen.findByText(/Workspaces unsupported:/)).toBeDefined();
    expect(screen.getByText(/Workspace discovery is unavailable/)).toBeDefined();
    expect(screen.getByText(/Runs unsupported:/)).toBeDefined();
    expect(screen.getByText(/Run evidence is unavailable/)).toBeDefined();
  });

  it('shows an authentication-specific recovery state', async () => {
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockRejectedValue(new SmartSwarmApiError('Unauthorized', 401)),
    })} />);

    expect(await screen.findByText('Operator authentication required')).toBeDefined();
    expect(screen.getByText(/operator token/)).toBeDefined();
  });

  it('retries provider discovery from the recovery action', async () => {
    const listProviders = vi.fn()
      .mockRejectedValueOnce(new SmartSwarmApiError('Unauthorized', 401))
      .mockResolvedValue([provider]);
    render(<SmartSwarmPage client={createClient({ listProviders })} />);
    await screen.findByText('Operator authentication required');

    fireEvent.click(screen.getByRole('button', { name: 'Retry smart-swarm' }));

    expect(await screen.findByText('Live dashboard')).toBeDefined();
    expect(listProviders).toHaveBeenCalledTimes(2);
  });

  it('retries a failed initial snapshot load', async () => {
    const fetchSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary snapshot outage'))
      .mockResolvedValue(snapshot);
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    expect(await screen.findByText('Smart-swarm unavailable')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Retry smart-swarm' }));

    expect(await screen.findByText('Live dashboard')).toBeDefined();
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
  });

  it('preserves a retry snapshot failure when provider discovery finishes later', async () => {
    let resolveProviders!: (value: RuntimeProvider[]) => void;
    const delayedProviders = new Promise<RuntimeProvider[]>((resolve) => { resolveProviders = resolve; });
    const listProviders = vi.fn()
      .mockResolvedValueOnce([provider])
      .mockReturnValueOnce(delayedProviders);
    const fetchSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error('Initial snapshot outage'))
      .mockRejectedValue(new Error('Retry snapshot outage'));
    render(<SmartSwarmPage client={createClient({ listProviders, fetchSnapshot })} />);
    await screen.findByText('Initial snapshot outage');

    fireEvent.click(screen.getByRole('button', { name: 'Retry smart-swarm' }));
    await screen.findByText('Retry snapshot outage');
    await act(async () => {
      resolveProviders([provider]);
      await delayedProviders;
    });

    expect(screen.getByText('Retry snapshot outage')).toBeDefined();
  });

  it('clears provider-scoped state when retry discovery replaces the provider', async () => {
    const replacement = { ...provider, id: 'codex', displayName: 'Codex' };
    const listProviders = vi.fn()
      .mockResolvedValueOnce([provider])
      .mockResolvedValueOnce([replacement]);
    const never = new Promise<RuntimeSnapshot>(() => undefined);
    const fetchSnapshot = vi.fn().mockImplementation((providerId: string) => (
      providerId === 'hermes' ? Promise.resolve(snapshot) : never
    ));
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    render(<SmartSwarmPage client={createClient({
      listProviders,
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        nextHandlers.connection?.('connected');
        return vi.fn();
      }),
    })} />);
    await screen.findByText('Live dashboard');
    act(() => handlers.error?.(new Error('Stream failed')));

    fireEvent.click(screen.getByRole('button', { name: 'Retry smart-swarm' }));

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledWith('codex', { activityLimit: 100 }));
    expect(screen.queryByText('Live dashboard')).toBeNull();
  });

  it('shows an unavailable configuration state when no providers are returned', async () => {
    render(<SmartSwarmPage client={createClient({ listProviders: vi.fn().mockResolvedValue([]) })} />);
    expect(await screen.findByText('No smart-swarm runtimes configured')).toBeDefined();
  });

  it('reports when the selected provider cannot open a live subscription', async () => {
    const subscribe = vi.fn();
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          streaming: { status: 'unsupported', reason: 'Streaming is unavailable.' },
        },
      }]),
      subscribe,
    })} />);

    expect(await screen.findByText('Live updates unavailable')).toBeDefined();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('refreshes snapshot-only topology without stream activity', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          streaming: { status: 'unsupported', reason: 'Streaming is unavailable.' },
        },
      }]),
      fetchSnapshot,
    })} />);

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh topology' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
  });

  it('opens provider-wide streams when workspace discovery is unavailable', async () => {
    const subscribe = vi.fn().mockImplementation(async (_providerId, _workspaceId, handlers) => {
      handlers.connection?.('connected');
      return vi.fn();
    });
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        workspaces: { status: 'unsupported', reason: 'Workspace discovery unavailable.' },
      }),
      subscribe,
    })} />);

    expect(await screen.findByText('Live · connected')).toBeDefined();
    expect(subscribe).toHaveBeenCalledWith('hermes', undefined, expect.any(Object));
  });

  it('preserves provider-wide data when unsupported workspace discovery is refreshed', async () => {
    const unsupportedWorkspaceSnapshot: RuntimeSnapshot = {
      ...snapshot,
      workspaces: { status: 'unsupported', reason: 'Hermes does not expose workspace discovery.' },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(unsupportedWorkspaceSnapshot),
    })} />);

    expect(await screen.findByText('Live dashboard')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspaces' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh workspaces' }).hasAttribute('disabled')).toBe(false));
    expect(screen.getByText('Live dashboard')).toBeDefined();
  });

  it('preserves the selected workspace when its scoped snapshot cannot discover workspaces', async () => {
    const secondWorkspace = { id: 'board-secondary', name: 'Secondary board', kind: 'board' as const, state: 'available' as const };
    const expandedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      workspaces: {
        status: 'available',
        data: [...snapshot.workspaces.status === 'available' ? snapshot.workspaces.data : [], secondWorkspace],
      },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(expandedSnapshot)
      .mockResolvedValueOnce(expandedSnapshot)
      .mockResolvedValueOnce({
        ...expandedSnapshot,
        workspaces: { status: 'unsupported', reason: 'Workspace discovery is temporarily unavailable.' },
      });
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'board-secondary' } });

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText('Workspace')).toHaveProperty('value', 'board-secondary');
  });

  it('clears transient stream errors after reconnection', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    render(<SmartSwarmPage client={createClient({
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        nextHandlers.connection?.('connected');
        return vi.fn();
      }),
    })} />);
    await screen.findByText('Live · connected');

    handlers.error?.(new Error('Temporary ticket failure'));
    expect(await screen.findByText('Smart-swarm unavailable')).toBeDefined();
    handlers.connection?.('connected');

    await waitFor(() => expect(screen.queryByText('Smart-swarm unavailable')).toBeNull());
  });

  it('does not clear snapshot failures when the stream reconnects', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('Snapshot refresh failed'));
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        nextHandlers.connection?.('connected');
        return vi.fn();
      }),
    })} />);
    await screen.findByText('Live · connected');
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');

    act(() => handlers.event({ ...baseEvent, id: 'refresh-event', cursor: 'refresh-cursor' }));
    expect(await screen.findByText('Snapshot refresh failed', {}, { timeout: 1_000 })).toBeDefined();
    act(() => handlers.connection?.('connected'));
    expect(screen.getByText('Snapshot refresh failed')).toBeDefined();
  });

  it('clears stream failures when changing runtime providers', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const subscribe = vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
      handlers = nextHandlers;
      nextHandlers.connection?.('connected');
      return () => undefined;
    });
    const alternateProvider: RuntimeProvider = {
      ...provider,
      id: 'offline',
      displayName: 'Offline runtime',
      capabilities: {
        ...provider.capabilities,
        streaming: { status: 'unsupported', reason: 'Offline runtime does not stream.' },
      },
    };
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([provider, alternateProvider]),
      fetchSnapshot: vi.fn().mockImplementation(async (providerId: string) => ({ ...snapshot, providerId })),
      subscribe,
    })} />);
    await screen.findByText('Live dashboard');
    await waitFor(() => expect(subscribe).toHaveBeenCalledWith('hermes', 'board-main', expect.any(Object)));
    act(() => handlers.error?.(new Error('provider A stream failed')));
    expect(screen.getByRole('alert').textContent).toContain('provider A stream failed');

    fireEvent.change(screen.getByLabelText('Runtime provider'), { target: { value: 'offline' } });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Live updates unavailable')).toBeDefined();
  });

  it('coalesces snapshot refreshes from bursts of streamed activity', async () => {
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));

    for (const index of [1, 2, 3]) {
      act(() => handlers.event({
        ...baseEvent,
        id: `event-${index}`,
        cursor: `cursor-${index}`,
      }));
    }

    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });
  });

  it('serializes and rate-limits streamed topology refreshes', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    let resolveRefresh!: (value: RuntimeSnapshot) => void;
    const pendingRefresh = new Promise<RuntimeSnapshot>((resolve) => { resolveRefresh = resolve; });
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(pendingRefresh)
      .mockResolvedValue(snapshot);
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');

    act(() => handlers.event({ ...baseEvent, id: 'first', cursor: 'first' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });
    act(() => handlers.event({ ...baseEvent, id: 'second', cursor: 'second' }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchSnapshot).toHaveBeenCalledTimes(3);

    resolveRefresh(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchSnapshot).toHaveBeenCalledTimes(3);
  });

  it('keeps newest activity first before and after snapshot refreshes', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    const newestEvent = {
      ...baseEvent,
      id: 'newest-event',
      cursor: 'newest-cursor',
      occurredAt: '2026-07-26T01:00:00.000Z',
      summary: 'Newest event',
    };
    const olderOffsetEvent = { ...baseEvent, occurredAt: '2026-07-26T10:00:00.000+10:00' };
    const initialSnapshot: RuntimeSnapshot = {
      ...snapshot,
      events: { status: 'available', data: [olderOffsetEvent] },
    };
    const refreshedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      events: {
        status: 'available',
        data: [olderOffsetEvent, newestEvent],
      },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValue(refreshedSnapshot);
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));

    act(() => handlers.event(newestEvent));
    expect(screen.getByText('Newest event').compareDocumentPosition(screen.getByText('Focused tests passed')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });
    await waitFor(() => expect(
      screen.getByText('Newest event').compareDocumentPosition(screen.getByText('Focused tests passed')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING));
  });

  it('sorts activity by recency before applying the live evidence cap', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0]! : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    const history = Array.from({ length: 100 }, (_, index) => ({
      ...baseEvent,
      id: `history-${index}`,
      cursor: `history-${index}`,
      occurredAt: new Date(Date.UTC(2026, 6, 26, 0, index)).toISOString(),
      summary: `History ${index}`,
    }));
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({ ...snapshot, events: { status: 'available', data: history } }),
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await screen.findByText('History 99');

    act(() => handlers.event({
      ...baseEvent,
      id: 'live-newest',
      cursor: 'live-newest',
      occurredAt: '2026-07-26T02:00:00.000Z',
      summary: 'Live newest',
    }));

    expect(screen.getByText('History 99')).toBeDefined();
    expect(screen.queryByText('History 0')).toBeNull();
  });

  it('clears stale topology while switching runtime providers', async () => {
    const alternateProvider: RuntimeProvider = { ...provider, id: 'alternate', displayName: 'Alternate' };
    let resolveAlternate!: (value: RuntimeSnapshot) => void;
    const alternateSnapshot = new Promise<RuntimeSnapshot>((resolve) => { resolveAlternate = resolve; });
    const fetchSnapshot = vi.fn().mockImplementation((providerId: string) => (
      providerId === 'hermes' ? Promise.resolve(snapshot) : alternateSnapshot
    ));
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([provider, alternateProvider]),
      fetchSnapshot,
    })} />);
    await screen.findByText('Live dashboard');

    fireEvent.change(screen.getByLabelText('Runtime provider'), { target: { value: 'alternate' } });

    expect(await screen.findByText('Loading smart-swarm live state…')).toBeDefined();
    expect(screen.queryByText('Live dashboard')).toBeNull();

    resolveAlternate({ ...snapshot, providerId: 'alternate' });
    expect(await screen.findByRole('heading', { name: 'Alternate' })).toBeDefined();
  });

  it('does not let a cancelled provider snapshot block live refreshes', async () => {
    let codexHandlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const never = new Promise<RuntimeSnapshot>(() => undefined);
    const codexSnapshot: RuntimeSnapshot = {
      ...snapshot,
      providerId: 'codex',
      tasks: snapshot.tasks.status === 'available'
        ? { status: 'available', data: snapshot.tasks.data.map((task, index) => index === 0 ? { ...task, title: 'Codex task' } : task) }
        : snapshot.tasks,
    };
    const fetchSnapshot = vi.fn().mockImplementation((requestedProviderId: string, options?: { workspaceId?: string }) => {
      if (requestedProviderId === 'hermes' && options?.workspaceId) return never;
      return Promise.resolve(requestedProviderId === 'codex' ? codexSnapshot : snapshot);
    });
    const subscribe = vi.fn().mockImplementation(async (requestedProviderId, _workspaceId, handlers) => {
      if (requestedProviderId === 'codex') codexHandlers = handlers;
      handlers.connection?.('connected');
      return vi.fn();
    });
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([
        provider,
        { ...provider, id: 'codex', displayName: 'Codex' },
      ]),
      fetchSnapshot,
      subscribe,
    })} />);

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledWith('hermes', { workspaceId: 'board-main', activityLimit: 100 }));
    fireEvent.change(screen.getByLabelText('Runtime provider'), { target: { value: 'codex' } });
    expect(await screen.findByText('Codex task')).toBeDefined();
    await waitFor(() => expect(codexHandlers).toBeDefined());
    const callsBeforeEvent = fetchSnapshot.mock.calls.length;

    codexHandlers.event?.({
      id: 'codex-event', cursor: 'codex-cursor', workspaceId: 'board-main', taskId: 'task-live', runId: null,
      type: 'lifecycle', occurredAt: '2026-07-26T18:10:00Z', summary: 'Codex task changed',
    });
    await waitFor(() => expect(fetchSnapshot.mock.calls.length).toBeGreaterThan(callsBeforeEvent), { timeout: 1_000 });
  });

  it('preserves the provider workspace catalog after scoped snapshots', async () => {
    const secondWorkspace = { id: 'board-secondary', name: 'Secondary board', kind: 'board' as const, state: 'available' as const };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce({
        ...snapshot,
        workspaces: { status: 'available', data: [...snapshot.workspaces.status === 'available' ? snapshot.workspaces.data : [], secondWorkspace] },
      })
      .mockResolvedValue({
        ...snapshot,
        workspaces: { status: 'available', data: snapshot.workspaces.status === 'available' ? snapshot.workspaces.data : [] },
      });
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    const workspaceSelect = screen.getByLabelText('Workspace') as HTMLSelectElement;
    expect(workspaceSelect.options).toHaveLength(2);

    fireEvent.change(workspaceSelect, { target: { value: 'board-secondary' } });
    await waitFor(() => expect(fetchSnapshot).toHaveBeenLastCalledWith('hermes', {
      workspaceId: 'board-secondary',
      activityLimit: 100,
    }));
  });

  it('refreshes the provider workspace catalog without remounting', async () => {
    const secondWorkspace = { id: 'board-secondary', name: 'Secondary board', kind: 'board' as const, state: 'available' as const };
    const expandedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      workspaces: {
        status: 'available',
        data: [...snapshot.workspaces.status === 'available' ? snapshot.workspaces.data : [], secondWorkspace],
      },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(expandedSnapshot);
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspaces' }));

    await waitFor(() => expect((screen.getByLabelText('Workspace') as HTMLSelectElement).options).toHaveLength(2));
    expect(fetchSnapshot).toHaveBeenLastCalledWith('hermes', { activityLimit: 1 });
  });

  it('does not clear a topology failure after a workspace catalog refresh succeeds', async () => {
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('Topology refresh failed.'))
      .mockResolvedValueOnce(snapshot);
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh topology' }));
    expect(await screen.findByText('Topology refresh failed.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspaces' }));

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(4));
    expect(screen.getByText('Topology refresh failed.')).toBeDefined();
  });

  it('reconciles the selected workspace when a catalog refresh removes it', async () => {
    const secondWorkspace = { id: 'board-secondary', name: 'Secondary board', kind: 'board' as const, state: 'available' as const };
    const expandedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      workspaces: { status: 'available', data: [snapshot.workspaces.status === 'available' ? snapshot.workspaces.data[0]! : secondWorkspace, secondWorkspace] },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(expandedSnapshot)
      .mockResolvedValueOnce(expandedSnapshot)
      .mockResolvedValueOnce(expandedSnapshot)
      .mockResolvedValue({
        ...snapshot,
        workspaces: {
          status: 'available',
          data: [
            { id: 'board-offline', name: 'Offline board', kind: 'board', state: 'unavailable' },
            snapshot.workspaces.status === 'available' ? snapshot.workspaces.data[0]! : secondWorkspace,
          ],
        },
      });
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'board-secondary' } });
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspaces' }));

    await waitFor(() => expect(screen.getByLabelText('Workspace')).toHaveProperty('value', 'board-main'));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenLastCalledWith('hermes', {
      workspaceId: 'board-main',
      activityLimit: 100,
    }));
  });

  it('discards a workspace catalog refresh after the provider changes', async () => {
    const alternateProvider: RuntimeProvider = { ...provider, id: 'alternate', displayName: 'Alternate' };
    const alternateWorkspace = { id: 'alternate-board', name: 'Alternate board', kind: 'board' as const, state: 'available' as const };
    const staleWorkspace = { id: 'stale-board', name: 'Stale Hermes board', kind: 'board' as const, state: 'available' as const };
    let resolveCatalogRefresh!: (value: RuntimeSnapshot) => void;
    const catalogRefresh = new Promise<RuntimeSnapshot>((resolve) => { resolveCatalogRefresh = resolve; });
    const fetchSnapshot = vi.fn().mockImplementation((providerId: string, options?: { workspaceId?: string; activityLimit?: number }) => {
      if (providerId === 'hermes' && options?.activityLimit === 1) return catalogRefresh;
      if (providerId === 'alternate') {
        return Promise.resolve({
          ...snapshot,
          providerId,
          workspaces: { status: 'available', data: [alternateWorkspace] },
          tasks: { status: 'available', data: [] },
          runs: { status: 'available', data: [] },
        });
      }
      return Promise.resolve(snapshot);
    });
    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([provider, alternateProvider]),
      fetchSnapshot,
    })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspaces' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));

    fireEvent.change(screen.getByLabelText('Runtime provider'), { target: { value: 'alternate' } });
    await waitFor(() => expect((screen.getByLabelText('Workspace') as HTMLSelectElement).value).toBe('alternate-board'));
    resolveCatalogRefresh({
      ...snapshot,
      workspaces: { status: 'available', data: [staleWorkspace] },
    });

    await waitFor(() => expect(screen.queryByRole('option', { name: 'Stale Hermes board' })).toBeNull());
    expect(screen.getByRole('option', { name: 'Alternate board' })).toBeDefined();
  });

  it('closes task details immediately when changing workspaces', async () => {
    const secondWorkspace = { id: 'board-secondary', name: 'Secondary board', kind: 'board' as const, state: 'available' as const };
    let resolveWorkspaceSnapshot!: (value: RuntimeSnapshot) => void;
    const workspaceSnapshot = new Promise<RuntimeSnapshot>((resolve) => { resolveWorkspaceSnapshot = resolve; });
    const expandedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      workspaces: {
        status: 'available',
        data: [...snapshot.workspaces.status === 'available' ? snapshot.workspaces.data : [], secondWorkspace],
      },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(expandedSnapshot)
      .mockResolvedValueOnce(expandedSnapshot)
      .mockReturnValueOnce(workspaceSnapshot);
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    await screen.findByRole('button', { name: 'Inspect Live dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    expect(screen.getByRole('dialog', { name: 'Live dashboard details' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'board-secondary' } });

    expect(screen.queryByRole('dialog', { name: 'Live dashboard details' })).toBeNull();
    resolveWorkspaceSnapshot({ ...expandedSnapshot, tasks: { status: 'available', data: [] } });
  });

  it('shows the newest runs before bounding task evidence', async () => {
    const baseRun = snapshot.runs.status === 'available' ? snapshot.runs.data[0]! : undefined;
    if (!baseRun) throw new Error('Expected a run fixture');
    const runSnapshot: RuntimeSnapshot = {
      ...snapshot,
      runs: {
        status: 'available',
        data: Array.from({ length: 21 }, (_, index) => ({
          ...baseRun,
          id: index === 20 ? 'newest-run' : `run-${index}`,
          startedAt: index === 20 ? '2026-07-26T20:00:00.000Z' : `2026-07-25T${String(index).padStart(2, '0')}:00:00.000Z`,
          lastActiveAt: index === 20 ? '2026-07-26T20:01:00.000Z' : null,
        })),
      },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(runSnapshot) })} />);
    await screen.findByRole('button', { name: 'Inspect Live dashboard' });

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    expect(screen.getByText('newest-run')).toBeDefined();
    expect(screen.queryByText('run-0')).toBeNull();
  });

  it('shows the newest unfinished run on each task card', async () => {
    const baseRun = snapshot.runs.status === 'available' ? snapshot.runs.data[0]! : undefined;
    if (!baseRun) throw new Error('Expected a run fixture');
    const runSnapshot: RuntimeSnapshot = {
      ...snapshot,
      runs: {
        status: 'available',
        data: [
          { ...baseRun, id: 'older-open-run', state: 'running', finishedAt: null, startedAt: '2026-07-26T18:00:00Z', lastActiveAt: '2026-07-26T18:01:00Z' },
          { ...baseRun, id: 'newer-open-run', state: 'running', finishedAt: null, startedAt: '2026-07-26T19:00:00Z', lastActiveAt: '2026-07-26T19:01:00Z' },
          { ...baseRun, id: 'terminal-without-finish-time', state: 'failed', finishedAt: null, startedAt: '2026-07-26T20:00:00Z', lastActiveAt: '2026-07-26T20:01:00Z' },
        ],
      },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(runSnapshot) })} />);

    expect(await screen.findByText('Run newer-open-run: running')).toBeDefined();
    expect(screen.queryByText('Run older-open-run: running')).toBeNull();
    expect(screen.queryByText('Run terminal-without-finish-time: failed')).toBeNull();
  });

  it('bounds large live task topologies instead of freezing the operator view', async () => {
    const baseTask = snapshot.tasks.status === 'available' ? snapshot.tasks.data[0]! : undefined;
    const baseAgent = snapshot.agents.status === 'available' ? snapshot.agents.data[0]! : undefined;
    const baseRun = snapshot.runs.status === 'available' ? snapshot.runs.data[0]! : undefined;
    const baseBlocker = snapshot.blockers.status === 'available' ? snapshot.blockers.data[0]! : undefined;
    const baseApproval = snapshot.approvals.status === 'available' ? snapshot.approvals.data[0]! : undefined;
    if (!baseTask || !baseAgent || !baseRun || !baseBlocker || !baseApproval) throw new Error('Expected dense fixtures');
    let runFilterCalls = 0;
    const denseRuns = new Proxy(
      Array.from({ length: 205 }, (_, index) => ({ ...baseRun, id: `run-${index}`, taskId: `task-${index}` })),
      {
        get(target, property, receiver) {
          if (property === 'filter') {
            runFilterCalls += 1;
            return target.filter.bind(target);
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const denseSnapshot: RuntimeSnapshot = {
      ...snapshot,
      agents: {
        status: 'available',
        data: Array.from({ length: 205 }, (_, index) => ({
          ...baseAgent,
          id: `agent-${index}`,
          displayName: index === 204 ? 'Critical blocked agent' : `Idle agent ${index}`,
          state: index === 204 ? 'blocked' : 'idle',
          lastActiveAt: index === 204 ? '2026-07-26T20:00:00.000Z' : '2026-07-25T20:00:00.000Z',
        })),
      },
      tasks: {
        status: 'available',
        data: Array.from({ length: 205 }, (_, index) => ({
          ...baseTask,
          id: `task-${index}`,
          title: index === 204 ? 'Important blocked task' : `Runtime task ${index}`,
          state: index === 204 ? 'blocked' : 'queued',
        })),
      },
      runs: { status: 'available', data: denseRuns },
      blockers: {
        status: 'available',
        data: Array.from({ length: 205 }, (_, index) => ({ ...baseBlocker, id: `blocker-${index}` })),
      },
      approvals: {
        status: 'available',
        data: Array.from({ length: 205 }, (_, index) => ({ ...baseApproval, id: `approval-${index}` })),
      },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(denseSnapshot) })} />);

    expect(await screen.findByText('Showing 200 of 205 tasks')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Inspect Important blocked task' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Inspect/ })).toHaveLength(200);
    expect(screen.getByText('Showing 100 of 205 agents')).toBeDefined();
    expect(screen.getByText('Critical blocked agent')).toBeDefined();
    expect(screen.getByText('Showing 100 of 205 blockers')).toBeDefined();
    expect(screen.getByText('Showing 100 of 205 approvals')).toBeDefined();
    expect(runFilterCalls).toBeLessThanOrEqual(1);
  });

  it('keeps dependency evidence keyed by stable task identity', async () => {
    const baseTask = snapshot.tasks.status === 'available' ? snapshot.tasks.data[0]! : undefined;
    if (!baseTask) throw new Error('Expected a task fixture');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dependencySnapshot: RuntimeSnapshot = {
      ...snapshot,
      tasks: {
        status: 'available',
        data: [
          { ...baseTask, id: 'parent-1', title: 'Repeated dependency' },
          { ...baseTask, id: 'parent-2', title: 'Repeated dependency' },
          { ...baseTask, id: 'child', title: 'Child task', parentIds: ['parent-1', 'parent-2'] },
        ],
      },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(dependencySnapshot) })} />);

    expect(await screen.findByRole('button', { name: 'Inspect Child task' })).toBeDefined();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('same key'), expect.anything());
    consoleError.mockRestore();
  });

  it('renders hierarchy separately from execution dependencies', async () => {
    const baseTask = snapshot.tasks.status === 'available' ? snapshot.tasks.data[0]! : undefined;
    if (!baseTask) throw new Error('Expected a task fixture');
    const relationshipSnapshot: RuntimeSnapshot = {
      ...snapshot,
      tasks: {
        status: 'available',
        data: [
          { ...baseTask, id: 'parent', title: 'Planning parent' },
          { ...baseTask, id: 'dependency', title: 'Runtime dependency' },
          { ...baseTask, id: 'child', title: 'Child task', parentIds: ['parent'], dependencyIds: ['dependency'] },
        ],
      },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(relationshipSnapshot) })} />);

    const child = await screen.findByRole('button', { name: 'Inspect Child task' });
    expect(child.textContent).toContain('Parent Planning parent');
    expect(child.textContent).toContain('Depends on Runtime dependency');
    expect(child.textContent).not.toContain('Depends on Planning parent');
  });
});
