import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SmartSwarmPage } from './smart-swarm-page';
import { SmartSwarmApiError } from '../lib/smart-swarm-api';
import type {
  RuntimeEvent,
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
    executeAction: vi.fn().mockResolvedValue({
      status: 'applied',
      providerId: 'hermes',
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: 'blocker.resolve',
        targetId: 'task-live',
        outcome: 'applied',
        previousState: 'blocked',
        currentState: 'ready',
      },
    }),
    subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, handlers) => {
      handlers.connection?.('connected');
      return vi.fn();
    }),
    ...overrides,
  } as unknown as SmartSwarmApiClient;
}

afterEach(cleanup);

describe('SmartSwarmPage', () => {
  it('pulses from recent normalized runtime events with traceable provider and entity provenance', async () => {
    const occurredAt = new Date().toISOString();
    const sourceEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!sourceEvent) throw new Error('Expected normalized runtime event');
    const liveSnapshot: RuntimeSnapshot = {
      ...snapshot,
      events: {
        status: 'available',
        data: [{
          ...sourceEvent,
          occurredAt,
        }],
      },
    };

    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(liveSnapshot),
    })} />);

    const pulse = await screen.findByRole('region', { name: 'Runtime brain pulse' });
    expect(pulse.textContent).toContain('1 event in the last minute');
    expect(pulse.textContent).toContain('Hermes');
    expect(pulse.textContent).toContain('board-main');
    expect(pulse.textContent).toContain('task-live');
    expect(pulse.textContent).toContain('run-1');
    expect(pulse.textContent).toContain('log');
    expect(pulse.querySelector('time')?.getAttribute('datetime')).toBe(occurredAt);

    fireEvent.click(screen.getByRole('button', { name: 'Open source task task-live for event event-1' }));
    const detail = await screen.findByRole('dialog', { name: 'Live dashboard details' });
    expect(detail.textContent).toContain('run-1');
  });

  it('does not resolve a pulse source task from a different workspace', async () => {
    const occurredAt = new Date().toISOString();
    const crossWorkspaceSnapshot: RuntimeSnapshot = {
      ...snapshot,
      tasks: { status: 'available', data: [{
        id: 'task-cross', workspaceId: 'board-other', title: 'Wrong workspace task', state: 'running',
        parentIds: [], dependencyIds: [], ownerIds: [], priority: null, createdAt: occurredAt, updatedAt: occurredAt,
      }] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [{
        id: 'event-cross', cursor: 'cursor-cross', workspaceId: 'board-main', taskId: 'task-cross', runId: null,
        type: 'audit', occurredAt, summary: 'Cross-workspace task reference',
      }] },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(crossWorkspaceSnapshot),
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open source task task-cross for event event-cross' }));

    const detail = await screen.findByRole('dialog', { name: 'Source task task-cross unavailable' });
    expect(detail.textContent).toContain('outside the bounded task snapshot');
    expect(detail.textContent).not.toContain('Wrong workspace task');
  });

  it('does not include same-task-id run evidence from another workspace', async () => {
    const occurredAt = new Date().toISOString();
    const crossWorkspaceRunSnapshot: RuntimeSnapshot = {
      ...snapshot,
      runs: { status: 'available', data: [{
        id: 'run-cross', workspaceId: 'board-other', taskId: 'task-live', agentId: null, sessionId: null,
        state: 'running', startedAt: occurredAt, finishedAt: null, lastActiveAt: occurredAt, summary: 'Wrong workspace run',
      }] },
      events: { status: 'available', data: [{
        id: 'event-cross-run', cursor: 'cursor-cross-run', workspaceId: 'board-main', taskId: 'task-live', runId: null,
        type: 'log', occurredAt, summary: 'Task emitted workspace-scoped evidence',
      }] },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(crossWorkspaceRunSnapshot),
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open source task task-live for event event-cross-run' }));

    const detail = await screen.findByRole('dialog', { name: 'Live dashboard details' });
    expect(detail.textContent).not.toContain('run-cross');
    expect(detail.textContent).not.toContain('Wrong workspace run');
  });

  it('opens pulse sources outside the task bound with referenced run evidence or an explicit unavailable state', async () => {
    const occurredAt = new Date().toISOString();
    const externalRun = {
      id: 'run-external',
      workspaceId: 'board-main',
      taskId: 'task-external',
      agentId: 'worker-1',
      sessionId: 'session-external',
      state: 'running' as const,
      startedAt: occurredAt,
      finishedAt: null,
      lastActiveAt: occurredAt,
      summary: 'External task run is still observable',
    };
    const boundedSnapshot: RuntimeSnapshot = {
      ...snapshot,
      tasks: { status: 'available', data: snapshot.tasks.status === 'available' ? snapshot.tasks.data : [] },
      runs: { status: 'available', data: [externalRun] },
      events: {
        status: 'available',
        data: [
          {
            id: 'event-external', cursor: 'cursor-external', workspaceId: 'board-main', taskId: 'task-external', runId: 'run-external', type: 'log',
            occurredAt, summary: 'External task emitted evidence',
          },
          {
            id: 'event-missing', cursor: 'cursor-missing', workspaceId: 'board-main', taskId: 'task-missing', runId: 'run-missing', type: 'audit',
            occurredAt, summary: 'Missing source emitted evidence',
          },
        ],
      },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(boundedSnapshot),
    })} />);

    const externalTrigger = await screen.findByRole('button', { name: 'Open source task task-external for event event-external' });
    fireEvent.click(externalTrigger);
    let detail = await screen.findByRole('dialog', { name: 'Source task task-external unavailable' });
    expect(detail.textContent).toContain('outside the bounded task snapshot');
    expect(detail.textContent).toContain('run-external');
    expect(detail.textContent).toContain('External task run is still observable');
    externalTrigger.focus();
    fireEvent.keyDown(detail, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open source task task-missing for event event-missing' }));
    detail = await screen.findByRole('dialog', { name: 'Source task task-missing unavailable' });
    expect(detail.textContent).toContain('Referenced run evidence is unavailable');
  });

  it('upgrades an open pulse source when a later topology refresh includes its task', async () => {
    const occurredAt = new Date().toISOString();
    const sourceEvent: RuntimeEvent = {
      id: 'event-late-task',
      cursor: 'cursor-late-task',
      workspaceId: 'board-main',
      taskId: 'task-late',
      runId: null,
      type: 'log',
      occurredAt,
      summary: 'Task topology will arrive later',
    };
    const withoutTask: RuntimeSnapshot = {
      ...snapshot,
      tasks: { status: 'available', data: [] },
      events: { status: 'available', data: [sourceEvent] },
    };
    const withTask: RuntimeSnapshot = {
      ...withoutTask,
      tasks: { status: 'available', data: [{
        id: 'task-late',
        workspaceId: 'board-main',
        title: 'Late topology task',
        state: 'running',
        parentIds: [],
        dependencyIds: [],
        ownerIds: [],
        priority: null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      }] },
    };
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(withoutTask)
      .mockResolvedValueOnce(withoutTask)
      .mockResolvedValueOnce(withoutTask)
      .mockResolvedValue(withTask);
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open source task task-late for event event-late-task' }));
    expect(await screen.findByRole('dialog', { name: 'Source task task-late unavailable' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh topology' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('dialog', { name: 'Source task task-late unavailable' })).toBeDefined();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh topology' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh topology' }));

    const detail = await screen.findByRole('dialog', { name: 'Late topology task details' });
    expect(detail.textContent).toContain('Late topology task');
    expect(screen.queryByRole('dialog', { name: 'Source task task-late unavailable' })).toBeNull();
  });

  it('does not resolve referenced run evidence for a different task', async () => {
    const occurredAt = new Date().toISOString();
    const mismatchedRunSnapshot: RuntimeSnapshot = {
      ...snapshot,
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [{
        id: 'run-collision', workspaceId: 'board-main', taskId: 'task-other', agentId: null, sessionId: null,
        state: 'running', startedAt: occurredAt, finishedAt: null, lastActiveAt: occurredAt, summary: 'Wrong task run',
      }] },
      events: { status: 'available', data: [{
        id: 'event-collision', cursor: 'cursor-collision', workspaceId: 'board-main', taskId: 'task-source', runId: 'run-collision',
        type: 'log', occurredAt, summary: 'Task provenance must match',
      }] },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(mismatchedRunSnapshot),
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open source task task-source for event event-collision' }));

    const detail = await screen.findByRole('dialog', { name: 'Source task task-source unavailable' });
    expect(detail.textContent).toContain('Referenced run evidence is unavailable');
    expect(detail.textContent).not.toContain('Wrong task run');
  });

  it('does not resolve referenced run evidence from a different workspace', async () => {
    const occurredAt = new Date().toISOString();
    const mismatchedRunSnapshot: RuntimeSnapshot = {
      ...snapshot,
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [{
        id: 'run-collision', workspaceId: 'board-other', taskId: 'task-source', agentId: null, sessionId: null,
        state: 'running', startedAt: occurredAt, finishedAt: null, lastActiveAt: occurredAt, summary: 'Wrong workspace run',
      }] },
      events: { status: 'available', data: [{
        id: 'event-collision', cursor: 'cursor-collision', workspaceId: 'board-main', taskId: 'task-source', runId: 'run-collision',
        type: 'log', occurredAt, summary: 'Workspace provenance must match',
      }] },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(mismatchedRunSnapshot),
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open source task task-source for event event-collision' }));

    const detail = await screen.findByRole('dialog', { name: 'Source task task-source unavailable' });
    expect(detail.textContent).toContain('Referenced run evidence is unavailable');
    expect(detail.textContent).not.toContain('Wrong workspace run');
  });

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

  it('renders capability-aware metric provenance from adapter metadata', async () => {
    const adapterProvider = {
      ...provider,
      displayName: 'Hermes production adapter',
    };
    const unsupportedSections: RuntimeSnapshot = {
      ...snapshot,
      tasks: { status: 'unsupported', reason: 'Hermes exposes no canonical task source.' },
      events: { status: 'unsupported', reason: 'Hermes exposes no canonical event source.' },
      approvals: { status: 'unsupported', reason: 'Hermes exposes no canonical approval source.' },
    };

    render(<SmartSwarmPage client={createClient({
      listProviders: vi.fn().mockResolvedValue([adapterProvider]),
      fetchSnapshot: vi.fn().mockResolvedValue(unsupportedSections),
    })} />);

    const metrics = await screen.findByRole('region', { name: 'Live metric provenance' });
    expect(metrics.textContent).toContain('Hermes production adapter');
    expect(metrics.textContent).toContain('Captured 7/26/2026');
    expect(screen.getByTestId('metric-workspaces').textContent).toContain('1');
    expect(screen.getByTestId('metric-workspaces').textContent).toContain('available');
    expect(screen.getByTestId('metric-tasks').textContent).toContain('unsupported');
    expect(screen.getByTestId('metric-event-history').textContent).toContain('unsupported');
    expect(screen.getByTestId('metric-approvals').textContent).toContain('unsupported');
    expect(screen.getByTestId('metric-approvals').textContent).not.toMatch(/\b0\b/);
    const topology = screen.getByRole('region', { name: 'Runtime topology' });
    expect(topology.textContent).toContain('Tasks unsupported');
    expect(topology.textContent).not.toContain('0 tasks');
    const activity = screen.getByRole('heading', { name: 'Events and logs' }).closest('section');
    expect(activity?.textContent).toContain('Events unsupported');
    expect(activity?.textContent).not.toMatch(/Events and logs0/u);
  });

  it('moves focus into task details and restores it to the inspect trigger', async () => {
    render(<SmartSwarmPage client={createClient()} />);
    const inspect = await screen.findByRole('button', { name: 'Inspect Live dashboard' });
    inspect.focus();

    fireEvent.click(inspect);

    const close = screen.getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resolve blocker' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(inspect));
  });

  it('restores focus to the pulse Open source trigger after task drill-down closes', async () => {
    const sourceEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!sourceEvent) throw new Error('Expected normalized runtime event');
    const liveSnapshot: RuntimeSnapshot = {
      ...snapshot,
      events: { status: 'available', data: [{ ...sourceEvent, occurredAt: new Date().toISOString() }] },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(liveSnapshot),
    })} />);
    const openSource = await screen.findByRole('button', { name: 'Open source task task-live for event event-1' });
    openSource.focus();

    fireEvent.click(openSource);
    const close = await screen.findByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.click(close);

    await waitFor(() => expect(document.activeElement).toBe(openSource));
  });

  it('keeps focus trapped when a pending action disables the focused control', async () => {
    let finishAction: (() => void) | undefined;
    const executeAction = vi.fn().mockImplementation(() => new Promise((resolve) => {
      finishAction = () => resolve({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    }));
    render(<SmartSwarmPage client={createClient({ executeAction })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    const resolveBlocker = screen.getByRole('button', { name: 'Resolve blocker' });
    resolveBlocker.focus();

    fireEvent.click(resolveBlocker);
    expect(resolveBlocker).toHaveProperty('disabled', true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await act(async () => finishAction?.());
  });

  it('keeps task actions locked when an in-flight request dialog is reopened', async () => {
    let finishAction: (() => void) | undefined;
    const executeAction = vi.fn().mockImplementation(() => new Promise((resolve) => {
      finishAction = () => resolve({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    }));
    render(<SmartSwarmPage client={createClient({ executeAction })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    expect(screen.getByRole('button', { name: 'Resolve blocker' })).toHaveProperty('disabled', true);
    await act(async () => finishAction?.());
  });

  it('unlocks task actions when live state confirms the postcondition before the request resolves', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    let currentSnapshot = snapshot;
    let finishAction: (() => void) | undefined;
    const executeAction = vi.fn().mockImplementation(() => new Promise((resolve) => {
      finishAction = () => resolve({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    }));
    const fetchSnapshot = vi.fn().mockImplementation(async () => currentSnapshot);
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot,
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          cancellation: { status: 'supported' },
        },
      }]),
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await screen.findByText('Live dashboard');
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Resolve blocker' })).toHaveProperty('disabled', true);

    currentSnapshot = {
      ...snapshot,
      tasks: {
        status: 'available',
        data: snapshot.tasks.status === 'available'
          ? snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state: 'ready' as const } : task)
          : [],
      },
      blockers: { status: 'available', data: [] },
    };
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    act(() => handlers.event({ ...baseEvent, id: 'early-confirmation', cursor: 'early-confirmation' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    await act(async () => finishAction?.());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel task' })).toHaveProperty('disabled', false));
  });

  it('does not leak an action completion into another task detail dialog', async () => {
    let finishAction: (() => void) | undefined;
    const executeAction = vi.fn().mockImplementation(() => new Promise((resolve) => {
      finishAction = () => resolve({
        status: 'rejected',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        reason: 'First task action rejected',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'rejected',
        },
      });
    }));
    render(<SmartSwarmPage client={createClient({ executeAction })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Contract root' }));

    expect(screen.getByRole('dialog', { name: 'Contract root details' })).toBeDefined();
    await act(async () => finishAction?.());
    expect(screen.queryByText('rejected: First task action rejected')).toBeNull();
  });

  it('resolves a supported blocker through the runtime API and refreshes the live postcondition', async () => {
    const executeAction = vi.fn().mockResolvedValue({
      status: 'applied',
      providerId: 'hermes',
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: 'blocker.resolve',
        targetId: 'task-live',
        outcome: 'applied',
        previousState: 'blocked',
        currentState: 'ready',
      },
    });
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    render(<SmartSwarmPage client={createClient({ executeAction, fetchSnapshot })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));

    await screen.findByText('Blocker resolved; refreshing live state.');
    expect(executeAction).toHaveBeenCalledWith('hermes', expect.objectContaining({
      correlationId: expect.any(String),
      idempotencyKey: expect.any(String),
      action: {
        type: 'blocker.resolve',
        workspaceId: 'board-main',
        taskId: 'task-live',
        reason: 'Resolved from the authenticated smart-swarm dashboard',
      },
    }));
    expect(screen.getByRole('button', { name: 'Resolve blocker' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    expect(screen.getByRole('button', { name: 'Resolve blocker' })).toHaveProperty('disabled', true);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
  });

  it('reuses an action idempotency key after an uncertain response', async () => {
    const executeAction = vi.fn()
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValue({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    render(<SmartSwarmPage client={createClient({ executeAction })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    const resolveBlocker = screen.getByRole('button', { name: 'Resolve blocker' });

    fireEvent.click(resolveBlocker);
    await screen.findByText('network response lost');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    const retriedResolveBlocker = screen.getByRole('button', { name: 'Resolve blocker' });
    fireEvent.click(retriedResolveBlocker);
    await screen.findByText('Blocker resolved; refreshing live state.');

    const firstKey = executeAction.mock.calls[0]?.[1].idempotencyKey;
    const retryKey = executeAction.mock.calls[1]?.[1].idempotencyKey;
    expect(retryKey).toBe(firstKey);
  });

  it('isolates pending actions for the same task id across workspaces', async () => {
    const workspaceCatalog = [
      { id: 'board-main', name: 'Main board', kind: 'workspace' as const, state: 'available' as const },
      { id: 'board-other', name: 'Other board', kind: 'workspace' as const, state: 'available' as const },
    ];
    const snapshotFor = (selectedWorkspace: string): RuntimeSnapshot => ({
      ...snapshot,
      workspaces: { status: 'available', data: workspaceCatalog },
      tasks: {
        status: 'available',
        data: snapshot.tasks.status === 'available'
          ? snapshot.tasks.data.map((task) => task.id === 'task-live'
            ? { ...task, workspaceId: selectedWorkspace, title: `${selectedWorkspace} live task` }
            : { ...task, workspaceId: selectedWorkspace })
          : [],
      },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: {
        status: 'available',
        data: [{
          id: `${selectedWorkspace}-blocker`, workspaceId: selectedWorkspace, taskId: 'task-live',
          category: 'dependency', summary: 'Waiting', createdAt: '2026-07-26T17:50:00.000Z',
        }],
      },
      approvals: { status: 'available', data: [] },
    });
    const executeAction = vi.fn()
      .mockRejectedValueOnce(new TypeError('workspace A response lost'))
      .mockResolvedValue({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    const fetchSnapshot = vi.fn().mockImplementation(async (_providerId, options) => (
      snapshotFor(options?.workspaceId === 'board-other' ? 'board-other' : 'board-main')
    ));
    render(<SmartSwarmPage client={createClient({ executeAction, fetchSnapshot })} />);
    await screen.findByText('board-main live task');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect board-main live task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await screen.findByText('workspace A response lost');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), {
      target: { value: 'board-other' },
    });
    await screen.findByText('board-other live task');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect board-other live task' }));
    const otherResolve = screen.getByRole('button', { name: 'Resolve blocker' });
    expect(otherResolve).toHaveProperty('disabled', false);
    fireEvent.click(otherResolve);
    await waitFor(() => expect(executeAction).toHaveBeenCalledTimes(2));

    expect(executeAction.mock.calls[1]?.[1].idempotencyKey)
      .not.toBe(executeAction.mock.calls[0]?.[1].idempotencyKey);
  });

  it('retains an uncertain blocker key while the task remains blocked without blocker evidence', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const blockerlessSnapshot = {
      ...snapshot,
      blockers: { status: 'available' as const, data: [] },
    };
    const fetchSnapshot = vi.fn().mockResolvedValue(blockerlessSnapshot);
    const executeAction = vi.fn()
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValue({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await screen.findByText('network response lost');
    const firstKey = executeAction.mock.calls[0]?.[1].idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    act(() => handlers.event({ ...baseEvent, id: 'still-blocked', cursor: 'still-blocked' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await waitFor(() => expect(executeAction).toHaveBeenCalledTimes(2));

    expect(executeAction.mock.calls[1]?.[1].idempotencyKey).toBe(firstKey);
  });

  it('retains an uncertain action key across unrelated task state changes', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    let currentSnapshot = snapshot;
    const fetchSnapshot = vi.fn().mockImplementation(async () => currentSnapshot);
    const executeAction = vi.fn()
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValue({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await screen.findByText('network response lost');
    const uncertainKey = executeAction.mock.calls[0]?.[1].idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent || snapshot.tasks.status !== 'available') throw new Error('Expected runtime fixtures');
    currentSnapshot = {
      ...snapshot,
      tasks: {
        status: 'available',
        data: snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state: 'running' as const } : task),
      },
    };
    act(() => handlers.event({ ...baseEvent, id: 'unrelated-state', cursor: 'unrelated-state' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });

    currentSnapshot = snapshot;
    act(() => handlers.event({ ...baseEvent, id: 'blocked-again', cursor: 'blocked-again' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(4), { timeout: 6_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await waitFor(() => expect(executeAction).toHaveBeenCalledTimes(2));

    expect(executeAction.mock.calls[1]?.[1].idempotencyKey).toBe(uncertainKey);
  }, 10_000);

  it('retires an uncertain action key after refreshed state confirms the postcondition', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    let currentSnapshot = snapshot;
    const fetchSnapshot = vi.fn().mockImplementation(async () => currentSnapshot);
    const executeAction = vi.fn()
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValue({
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'blocker.resolve',
          targetId: 'task-live',
          outcome: 'applied',
        },
      });
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot,
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await screen.findByText('network response lost');
    const uncertainKey = executeAction.mock.calls[0]?.[1].idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    currentSnapshot = {
      ...snapshot,
      tasks: {
        status: 'available',
        data: snapshot.tasks.status === 'available'
          ? snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state: 'ready' as const } : task)
          : [],
      },
      blockers: { status: 'available', data: [] },
    };
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    act(() => handlers.event({ ...baseEvent, id: 'confirmed-action', cursor: 'confirmed-action' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3), { timeout: 1_000 });

    currentSnapshot = {
      ...snapshot,
      blockers: {
        status: 'available',
        data: [{
          id: 'blocker-2', workspaceId: 'board-main', taskId: 'task-live', category: 'dependency',
          summary: 'Waiting for a new contract', createdAt: '2026-07-26T18:05:00.000Z',
        }],
      },
    };
    act(() => handlers.event({ ...baseEvent, id: 'new-blocker', cursor: 'new-blocker' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(4), { timeout: 6_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));
    await waitFor(() => expect(executeAction).toHaveBeenCalledTimes(2));

    expect(executeAction.mock.calls[1]?.[1].idempotencyKey).not.toBe(uncertainKey);
  }, 10_000);

  it('submits a governed promotion and reports a typed rejection without claiming state changed', async () => {
    const executeAction = vi.fn().mockResolvedValue({
      status: 'rejected',
      providerId: 'hermes',
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      reason: 'Runtime action was not approved by the governor',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: 'policy.apply',
        targetId: 'task-live',
        outcome: 'rejected',
      },
    });
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        tasks: {
          status: 'available',
          data: snapshot.tasks.status === 'available'
            ? snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state: 'blocked' as const } : task)
            : [],
        },
        blockers: { status: 'available', data: [] },
      }),
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          pause: { status: 'supported' },
          resume: { status: 'supported' },
          cancellation: { status: 'supported' },
          policyActions: { status: 'supported' },
        },
      }]),
    })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    const pause = screen.getByRole('button', { name: 'Pause task' });
    expect(pause).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Resume task' })).toHaveProperty('disabled', true);
    const cancel = screen.getByRole('button', { name: 'Cancel task' });
    expect(cancel).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Promote task' }));

    expect(await screen.findByText('rejected: Runtime action was not approved by the governor')).toBeDefined();
    expect(executeAction).toHaveBeenCalledWith('hermes', expect.objectContaining({
      action: {
        type: 'policy.apply',
        workspaceId: 'board-main',
        taskId: 'task-live',
        policy: 'promote-task',
        reason: 'Promoted from the authenticated smart-swarm dashboard',
      },
    }));
  });

  it('does not expose pause when normalized state cannot keep the task resumable', async () => {
    const executeAction = vi.fn();
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        tasks: {
          status: 'available',
          data: snapshot.tasks.status === 'available'
            ? snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state: 'running' as const } : task)
            : [],
        },
      }),
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          pause: { status: 'supported' },
          resume: { status: 'supported' },
        },
      }]),
    })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    const pause = screen.getByRole('button', { name: 'Pause task' });
    expect(pause).toHaveProperty('disabled', true);
    expect(pause.getAttribute('title')).toBe(
      'Pause is disabled because normalized task state does not distinguish paused from queued work.',
    );
    fireEvent.click(pause);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('reports a typed failed action as failed rather than unsupported', async () => {
    const executeAction = vi.fn().mockResolvedValue({
      status: 'failed',
      providerId: 'hermes',
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      reason: 'Selected Hermes workspace is unavailable',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: 'blocker.resolve',
        targetId: 'task-live',
        outcome: 'failed',
      },
    });
    render(<SmartSwarmPage client={createClient({ executeAction })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve blocker' }));

    expect(await screen.findByText('failed: Selected Hermes workspace is unavailable')).toBeDefined();
    expect(screen.queryByText(/unsupported: Selected Hermes workspace/)).toBeNull();
  });

  it('unlocks a promoted task when refreshed state is already running', async () => {
    let currentSnapshot = snapshot;
    const fetchSnapshot = vi.fn().mockImplementation(async () => currentSnapshot);
    const executeAction = vi.fn().mockImplementation(async () => {
      currentSnapshot = {
        ...snapshot,
        tasks: {
          status: 'available',
          data: snapshot.tasks.status === 'available'
            ? snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state: 'running' as const } : task)
            : [],
        },
        blockers: { status: 'available', data: [] },
      };
      return {
        status: 'applied',
        providerId: 'hermes',
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        audit: {
          requestedBy: 'authenticated-operator',
          actionType: 'policy.apply',
          targetId: 'task-live',
          outcome: 'applied',
        },
      };
    });
    render(<SmartSwarmPage client={createClient({
      executeAction,
      fetchSnapshot,
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          pause: { status: 'supported' },
          cancellation: { status: 'supported' },
          policyActions: { status: 'supported' },
        },
      }]),
    })} />);
    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Promote task' }));

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel task' })).toHaveProperty('disabled', false));
  });

  it.each([
    ['queued', 'Resume task'],
    ['ready', 'Promote task'],
    ['running', 'Promote task'],
    ['unknown', 'Promote task'],
    ['archived', 'Promote task'],
    ['unknown', 'Cancel task'],
    ['archived', 'Cancel task'],
  ] as const)('keeps %s tasks out of unsafe %s actions', async (state, buttonName) => {
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue({
        ...snapshot,
        tasks: {
          status: 'available' as const,
          data: snapshot.tasks.status === 'available'
            ? snapshot.tasks.data.map((task) => task.id === 'task-live' ? { ...task, state } : task)
            : [],
        },
      }),
      listProviders: vi.fn().mockResolvedValue([{
        ...provider,
        capabilities: {
          ...provider.capabilities,
          cancellation: { status: 'supported' },
          resume: { status: 'supported' },
          policyActions: { status: 'supported' },
        },
      }]),
    })} />);

    await screen.findByText('Live dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));
    expect(screen.getByRole('button', { name: buttonName })).toHaveProperty('disabled', true);
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

  it('preserves streamed activity that arrives while a snapshot refresh is in flight', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Refresh topology' }));
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(3));
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');
    const streamedEvent = {
      ...baseEvent,
      id: 'streamed-during-refresh',
      cursor: 'cursor-during-refresh',
      occurredAt: '2026-07-26T18:00:03.000Z',
      summary: 'Streamed during refresh',
    };

    act(() => handlers.event(streamedEvent));
    expect(screen.getByText('Streamed during refresh')).toBeDefined();
    await act(async () => {
      resolveRefresh(snapshot);
      await pendingRefresh;
    });

    expect(screen.getByText('Streamed during refresh')).toBeDefined();
  });

  it('shows streamed activity when snapshot event history is unsupported', async () => {
    let handlers!: Parameters<SmartSwarmApiClient['subscribe']>[2];
    const unsupportedEventHistory: RuntimeSnapshot = {
      ...snapshot,
      events: { status: 'unsupported', reason: 'Historical event queries are unavailable.' },
    };
    render(<SmartSwarmPage client={createClient({
      fetchSnapshot: vi.fn().mockResolvedValue(unsupportedEventHistory),
      subscribe: vi.fn().mockImplementation(async (_providerId, _workspaceId, nextHandlers) => {
        handlers = nextHandlers;
        return vi.fn();
      }),
    })} />);
    await screen.findByText('Historical event queries are unavailable.');
    const baseEvent = snapshot.events.status === 'available' ? snapshot.events.data[0] : undefined;
    if (!baseEvent) throw new Error('Expected an event fixture');

    act(() => handlers.event({
      ...baseEvent,
      id: 'live-without-history',
      cursor: 'live-without-history',
      summary: 'Live event without history',
    }));

    expect(screen.getByText('Live event without history')).toBeDefined();
    expect(screen.getByText('Historical event queries are unavailable.')).toBeDefined();
    expect(screen.getByTitle('Events received live from Hermes.').textContent).toContain('1 live event');
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
    expect(screen.getByTitle(/Snapshot captured .* includes events received by the live stream/u)).toBeDefined();
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

  it('retries a failed workspace catalog request from the recovery action', async () => {
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('Workspace catalog refresh failed.'))
      .mockResolvedValue(snapshot);
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workspaces' }));
    expect(await screen.findByText('Workspace catalog refresh failed.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Retry smart-swarm' }));

    await waitFor(() => expect(screen.queryByText('Workspace catalog refresh failed.')).toBeNull());
    expect(fetchSnapshot.mock.calls.filter(([, options]) => options?.activityLimit === 1)).toHaveLength(2);
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

  it('clears the prior snapshot while a newly selected workspace loads', async () => {
    const secondWorkspace = { id: 'board-secondary', name: 'Secondary board', kind: 'board' as const, state: 'available' as const };
    const emptySnapshot: RuntimeSnapshot = {
      ...snapshot,
      state: 'empty',
      workspaces: {
        status: 'available',
        data: [...snapshot.workspaces.status === 'available' ? snapshot.workspaces.data : [], secondWorkspace],
      },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'available', data: [] },
    };
    const pendingWorkspace = new Promise<RuntimeSnapshot>(() => undefined);
    const fetchSnapshot = vi.fn().mockImplementation((_providerId: string, options?: { workspaceId?: string }) => (
      options?.workspaceId === 'board-secondary' ? pendingWorkspace : Promise.resolve(emptySnapshot)
    ));
    render(<SmartSwarmPage client={createClient({ fetchSnapshot })} />);
    expect(await screen.findByText('No runtime work in Main board')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'board-secondary' } });

    expect(await screen.findByText('Loading smart-swarm live state…')).toBeDefined();
    expect(screen.queryByText('No runtime work in Secondary board')).toBeNull();
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

  it('ranks recently finished runs before bounding task evidence', async () => {
    const baseRun = snapshot.runs.status === 'available' ? snapshot.runs.data[0]! : undefined;
    if (!baseRun) throw new Error('Expected a run fixture');
    const runSnapshot: RuntimeSnapshot = {
      ...snapshot,
      runs: {
        status: 'available',
        data: [
          ...Array.from({ length: 20 }, (_, index) => ({
            ...baseRun,
            id: `older-finished-run-${index}`,
            state: 'succeeded' as const,
            startedAt: `2026-07-25T${String(index).padStart(2, '0')}:00:00.000Z`,
            finishedAt: `2026-07-25T${String(index).padStart(2, '0')}:30:00.000Z`,
            lastActiveAt: null,
          })),
          {
            ...baseRun,
            id: 'recently-finished-long-run',
            state: 'succeeded' as const,
            startedAt: '2026-07-01T00:00:00.000Z',
            finishedAt: '2026-07-27T00:00:00.000Z',
            lastActiveAt: null,
          },
        ],
      },
    };
    render(<SmartSwarmPage client={createClient({ fetchSnapshot: vi.fn().mockResolvedValue(runSnapshot) })} />);
    await screen.findByRole('button', { name: 'Inspect Live dashboard' });

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Live dashboard' }));

    expect(screen.getByText('recently-finished-long-run')).toBeDefined();
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
