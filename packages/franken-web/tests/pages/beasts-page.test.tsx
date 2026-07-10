import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { BeastsPage } from '../../src/pages/beasts-page';
import { useBeastStore } from '../../src/stores/beast-store';

afterEach(() => {
  cleanup();
  useBeastStore.getState().resetWizard();
});

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

  it('disables every create-agent entry point when the Beast API is unavailable', () => {
    render(
      <BeastsPage
        {...baseProps}
        agents={[]}
        disabled={true}
        error="Beast API not available"
      />,
    );

    const headerCreateButton = screen.getByRole('button', { name: /^\+ create agent$/i });
    const emptyStateCreateButton = screen.getByRole('button', { name: /create your first agent/i });

    expect(headerCreateButton.hasAttribute('disabled')).toBe(true);
    expect(emptyStateCreateButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('Beast API not available').length).toBeGreaterThan(0);

    fireEvent.click(emptyStateCreateButton);
    expect(screen.queryByText('Identity')).toBeNull();
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

  it('keeps the Create Agent wizard open and shows launch errors', async () => {
    const onLaunch = vi.fn().mockRejectedValue(new Error(
      "Dispatch failed for tracked agent 'agent-1': Invalid chunk-plan config: outputDir is required",
    ));

    render(<BeastsPage
      {...baseProps}
      catalog={[{
        id: 'martin-loop',
        label: 'Martin Loop',
        description: 'Implementation workflow',
        executionModeDefault: 'process',
        interviewPrompts: [],
      }]}
      onLaunch={onLaunch}
    />);
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }));
    act(() => {
      useBeastStore.getState().setStepValues(0, { name: 'Dispatch Failure Agent' });
      useBeastStore.getState().setStepValues(1, {
        workflowType: 'martin-loop',
        provider: 'codex',
        objective: 'Implement chunks',
        chunkDirectory: 'tasks/chunks',
      });
      useBeastStore.setState({ wizardStep: 7, highestCompleted: 6 });
    });

    fireEvent.click(screen.getByRole('button', { name: /launch agent/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Dispatch failed for tracked agent');
    });
    expect(screen.getByText('Create Agent')).toBeTruthy();
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });
});
