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
  runs: [],
  disabled: false,
  error: null,
  logs: [] as string[],
  selectedAgentId: null,
  onClose: vi.fn(),
  onLaunch: vi.fn(),
  onDelete: vi.fn(),
  onKill: vi.fn(),
  onRestart: vi.fn(),
  onResume: vi.fn(),
  onSaveAgentConfig: vi.fn(),
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

  it('shows Create Agent button that opens wizard dialog', () => {
    render(<BeastsPage {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    // Wizard opens — step indicator renders
    expect(screen.getByText('Identity')).toBeTruthy();
  });

  it('drives wizard workflow choices from backend catalog prop', () => {
    render(<BeastsPage {...baseProps} catalog={[{
      id: 'custom-beast',
      label: 'Custom Backend Beast',
      description: 'Served from backend catalog',
      executionModeDefault: 'process',
      interviewPrompts: [
        { key: 'objective', prompt: 'What should the custom beast do?', kind: 'string', required: true },
      ],
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    fireEvent.change(screen.getByLabelText(/agent name/i), { target: { value: 'Catalog Agent' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Custom Backend Beast')).toBeTruthy();
    expect(screen.queryByText('Design Interview')).toBeNull();
  });

  it('shows error banner when error prop is set', () => {
    render(<BeastsPage {...baseProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
