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
    expect(screen.getByRole('button', { name: 'Kill' })).toBeTruthy();
  });

  it('requires cancelable confirmation before killing a running agent', () => {
    render(<AgentActionBar status="running" hasLinkedRun={true} agentLabel="Scout A" {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: 'Kill' }));

    expect(handlers.onKill).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Kill tracked agent')).toBeTruthy();
    expect(screen.getByText(/Kill Scout A\?/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onKill).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Kill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kill agent' }));

    expect(handlers.onKill).toHaveBeenCalledTimes(1);
  });

  it('shows Start, Resume, Delete for stopped with linked run', () => {
    render(<AgentActionBar status="stopped" hasLinkedRun={true} {...handlers} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Resume')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('requires cancelable confirmation before deleting a stopped agent', () => {
    render(<AgentActionBar status="stopped" hasLinkedRun={true} agentLabel="Scout A" {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Delete tracked agent')).toBeTruthy();
    expect(screen.getByText(/Delete Scout A\?/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }));

    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows Start, Delete for failed agent', () => {
    render(<AgentActionBar status="failed" hasLinkedRun={false} {...handlers} />);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
  });
});
