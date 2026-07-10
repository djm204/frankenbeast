import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentList } from '../../../src/components/beasts/agent-list';
import type { BeastRunSummary, TrackedAgentSummary } from '../../../src/lib/beast-api';

afterEach(cleanup);

const agents: TrackedAgentSummary[] = [
  {
    id: 'agent-1', definitionId: 'design-interview', status: 'running',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'design-interview', command: '/interview', config: {} },
    initConfig: {}, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:05:00Z',
  },
  {
    id: 'agent-2', definitionId: 'chunk-plan', status: 'stopped',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'chunk-plan', command: '/plan', config: {} },
    initConfig: {}, createdAt: '2026-03-15T09:00:00Z', updatedAt: '2026-03-15T09:30:00Z',
  },
  {
    id: 'agent-3', definitionId: 'design-interview', status: 'awaiting_approval',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'design-interview', command: '/interview', config: {} },
    initConfig: {}, createdAt: '2026-03-15T08:00:00Z', updatedAt: '2026-03-15T08:30:00Z',
  },
  {
    id: 'agent-4', definitionId: 'chunk-plan', status: 'deleted',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'chunk-plan', command: '/plan', config: {} },
    initConfig: {}, createdAt: '2026-03-15T07:00:00Z', updatedAt: '2026-03-15T07:30:00Z',
  },
];

describe('AgentList', () => {
  it('renders all agents', () => {
    render(<AgentList agents={agents} runs={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.getByText('agent-2')).toBeTruthy();
  });

  it('shows empty state when no agents', () => {
    render(<AgentList agents={[]} runs={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    expect(screen.getByText(/no agents yet/i)).toBeTruthy();
  });

  it('filters agents by search text', () => {
    render(<AgentList agents={agents} runs={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'agent-1' } });
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.queryByText('agent-2')).toBeNull();
  });

  it('filters agents by status', () => {
    render(<AgentList agents={agents} runs={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: 'running' } });
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.queryByText('agent-2')).toBeNull();
    expect(screen.queryByText('agent-3')).toBeNull();
    expect(screen.queryByText('agent-4')).toBeNull();
  });

  it('exposes backend-only tracked agent statuses in the status filter', () => {
    render(<AgentList agents={agents} runs={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const statusSelect = screen.getByLabelText(/filter by status/i) as HTMLSelectElement;

    const optionValues = Array.from(statusSelect.options).map((option) => option.value);
    expect(optionValues).toEqual([
      '',
      'initializing',
      'awaiting_approval',
      'dispatching',
      'running',
      'completed',
      'failed',
      'stopped',
      'deleted',
    ]);

    fireEvent.change(statusSelect, { target: { value: 'awaiting_approval' } });
    expect(screen.getByText('agent-3')).toBeTruthy();
    expect(screen.queryByText('agent-1')).toBeNull();
    expect(screen.queryByText('agent-4')).toBeNull();

    fireEvent.change(statusSelect, { target: { value: 'deleted' } });
    expect(screen.getByText('agent-4')).toBeTruthy();
    expect(screen.queryByText('agent-1')).toBeNull();
    expect(screen.queryByText('agent-3')).toBeNull();
  });

  it('has create agent button in empty state', () => {
    const onCreate = vi.fn();
    render(<AgentList agents={[]} runs={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={onCreate} />);
    fireEvent.click(screen.getByText(/create your first agent/i));
    expect(onCreate).toHaveBeenCalled();
  });

  it('shows execution mode from the agent dispatch run rather than an older run', () => {
    const linkedAgent = { ...agents[0]!, dispatchRunId: 'run-new' };
    const runs: BeastRunSummary[] = [
      {
        id: 'run-old', definitionId: 'design-interview', status: 'completed', dispatchedBy: 'api',
        dispatchedByUser: 'pfk', trackedAgentId: 'agent-1', attemptCount: 1, executionMode: 'process',
        createdAt: '2026-03-15T09:00:00Z',
      },
      {
        id: 'run-new', definitionId: 'design-interview', status: 'running', dispatchedBy: 'api',
        dispatchedByUser: 'pfk', trackedAgentId: 'agent-1', attemptCount: 1, executionMode: 'container',
        createdAt: '2026-03-15T10:00:00Z',
      },
    ];

    render(<AgentList agents={[linkedAgent]} runs={runs} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);

    expect(screen.getByText('container mode')).toBeTruthy();
    expect(screen.queryByText('process mode')).toBeNull();
  });
});
