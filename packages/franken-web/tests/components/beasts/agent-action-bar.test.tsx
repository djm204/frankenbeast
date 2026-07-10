import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AgentActionBar } from '../../../src/components/beasts/agent-action-bar';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentActionBar', () => {
  const handlers = {
    onStart: vi.fn(), onStop: vi.fn(), onRestart: vi.fn(),
    onResume: vi.fn(), onDelete: vi.fn(), onKill: vi.fn(),
  };

  it('shows Stop for initializing agent', () => {
    render(<AgentActionBar status="initializing" hasLinkedRun={false} {...handlers} />);
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.queryByText('Restart')).toBeNull();
  });

  it('shows Stop, Restart, Kill for running agent', () => {
    render(<AgentActionBar status="running" hasLinkedRun={true} {...handlers} />);
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.getByText('Restart')).toBeTruthy();
    expect(screen.getByText('Kill')).toBeTruthy();
  });

  it('shows Start, Resume, Delete for stopped with linked run', () => {
    render(<AgentActionBar status="stopped" hasLinkedRun={true} {...handlers} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('shows Start, Delete for failed agent', () => {
    render(<AgentActionBar status="failed" hasLinkedRun={false} {...handlers} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
  });

  it('requires confirmation before deleting a tracked agent', () => {
    render(<AgentActionBar status="stopped" hasLinkedRun={false} agentLabel="Review Agent" {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete tracked agent')).toBeTruthy();
    expect(screen.getByText(/Review Agent/)).toBeTruthy();
    expect(screen.getByText(/soft-deletes it and removes it from the dashboard history/i)).toBeTruthy();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('cancels tracked-agent delete without calling the delete handler', () => {
    render(<AgentActionBar status="completed" hasLinkedRun={false} agentLabel="agent-123" {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('confirms tracked-agent delete exactly once', () => {
    render(<AgentActionBar status="failed" hasLinkedRun={false} agentLabel="agent-123" {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }));

    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });
});
