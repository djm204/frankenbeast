import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentList } from '../../../src/components/beasts/agent-list';
import type { TrackedAgentSummary } from '../../../src/lib/beast-api';

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
];

describe('AgentList', () => {
  it('renders all agents', () => {
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.getByText('agent-2')).toBeTruthy();
  });

  it('shows empty state when no agents', () => {
    render(<AgentList agents={[]} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    expect(screen.getByText(/no agents yet/i)).toBeTruthy();
  });

  it('filters agents by search text', () => {
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: 'agent-1' } });
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.queryByText('agent-2')).toBeNull();
  });

  it('filters agents by status', () => {
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={vi.fn()} />);
    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: 'running' } });
    expect(screen.getByText('agent-1')).toBeTruthy();
    expect(screen.queryByText('agent-2')).toBeNull();
  });

  it('has create agent button', () => {
    const onCreate = vi.fn();
    render(<AgentList agents={agents} selectedAgentId={null} onSelectAgent={vi.fn()} onCreateAgent={onCreate} />);
    fireEvent.click(screen.getByText(/create agent/i));
    expect(onCreate).toHaveBeenCalled();
  });
});
