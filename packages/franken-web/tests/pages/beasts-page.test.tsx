import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BeastsPage } from '../../src/pages/beasts-page';

afterEach(cleanup);

const baseProps = {
  agents: [
    {
      id: 'agent-1',
      definitionId: 'design-interview',
      status: 'running',
      source: 'dashboard',
      createdByUser: 'pfk',
      initAction: { kind: 'design-interview' as const, command: '/interview', config: {} },
      initConfig: {},
      createdAt: '2026-03-15T10:00:00Z',
      updatedAt: '2026-03-15T10:05:00Z',
    },
  ],
  agentDetail: null,
  catalog: [],
  disabled: false,
  error: null,
  logs: [] as string[],
  selectedAgentId: null,
  onClose: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
  onKill: vi.fn(),
  onRestart: vi.fn(),
  onResume: vi.fn(),
  onSelectAgent: vi.fn(),
  onStart: vi.fn(),
  onStop: vi.fn(),
};

describe('BeastsPage', () => {
  it('renders the agent list', () => {
    render(<BeastsPage {...baseProps} />);
    expect(screen.getByText('agent-1')).toBeTruthy();
  });

  it('calls onSelectAgent when agent row is clicked', () => {
    render(<BeastsPage {...baseProps} />);
    fireEvent.click(screen.getByText('agent-1'));
    expect(baseProps.onSelectAgent).toHaveBeenCalledWith('agent-1');
  });

  it('shows Create Agent button that calls onCreate', () => {
    render(<BeastsPage {...baseProps} />);
    const btns = screen.getAllByRole('button', { name: /create agent/i });
    fireEvent.click(btns[0]!);
    expect(baseProps.onCreate).toHaveBeenCalled();
  });

  it('shows error banner when error prop is set', () => {
    render(<BeastsPage {...baseProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
