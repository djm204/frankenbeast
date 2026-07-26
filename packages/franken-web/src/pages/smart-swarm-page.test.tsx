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

  it('shows degraded runtime evidence without hiding available sections', async () => {
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({ ...snapshot, state: 'degraded', message: 'Approvals are temporarily unreadable.' }),
    })} />);

    expect(await screen.findByText('Live state is degraded')).toBeDefined();
    expect(screen.getByText('Approvals are temporarily unreadable.')).toBeDefined();
    expect(screen.getByText('Live dashboard')).toBeDefined();
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
    expect(fetchSnapshot).toHaveBeenCalledTimes(3);
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

  it('serializes streamed refreshes while a snapshot request is in flight', async () => {
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
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(4), { timeout: 1_000 });
  });

  it('keeps newest activity first before and after snapshot refreshes', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    const newestEvent = {
      ...baseEvent,
      id: 'newest-event',
      cursor: 'newest-cursor',
      occurredAt: '2026-07-26T19:00:00.000Z',
      summary: 'Newest event',
    };
    const refreshedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      events: { status: 'available', data: [baseEvent, newestEvent] },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
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

  it('bounds large live task topologies instead of freezing the operator view', async () => {
    const baseTask = snapshot.tasks.status === 'available' ? snapshot.tasks.data[0]! : undefined;
    const baseAgent = snapshot.agents.status === 'available' ? snapshot.agents.data[0]! : undefined;
    const baseBlocker = snapshot.blockers.status === 'available' ? snapshot.blockers.data[0]! : undefined;
    const baseApproval = snapshot.approvals.status === 'available' ? snapshot.approvals.data[0]! : undefined;
    if (!baseTask || !baseAgent || !baseBlocker || !baseApproval) throw new Error('Expected dense fixtures');
    const denseSnapshot: RuntimeSnapshot = {
      ...snapshot,
      agents: {
        status: 'available',
        data: Array.from({ length: 205 }, (_, index) => ({ ...baseAgent, id: `agent-${index}` })),
      },
      tasks: {
        status: 'available',
        data: Array.from({ length: 205 }, (_, index) => ({
          ...baseTask,
          id: `task-${index}`,
          title: index === 204 ? 'Important blocked task' : `Runtime task ${index}`,
          state: index === 204 ? 'blocked' : 'succeeded',
        })),
      },
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
    expect(screen.getByText('Showing 100 of 205 blockers')).toBeDefined();
    expect(screen.getByText('Showing 100 of 205 approvals')).toBeDefined();
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
});
