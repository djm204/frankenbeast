import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { AgentActionBar, type AgentLifecycleAction } from '../../../src/components/beasts/agent-action-bar';

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

  it('disables running-agent controls while a stop request is pending', () => {
    render(<AgentActionBar status="running" hasLinkedRun={true} pendingAction="stop" {...handlers} />);

    expect(screen.getByRole('button', { name: 'Stopping...' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Restart' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Kill' }).getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stopping...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kill' }));

    expect(handlers.onStop).not.toHaveBeenCalled();
    expect(handlers.onRestart).not.toHaveBeenCalled();
    expect(handlers.onKill).not.toHaveBeenCalled();
  });

  it('guards duplicate running-agent action clicks after a request enters pending state', () => {
    function PendingHarness() {
      const [pendingAction, setPendingAction] = useState<AgentLifecycleAction | null>(null);
      return (
        <AgentActionBar
          status="running"
          hasLinkedRun={true}
          pendingAction={pendingAction}
          {...handlers}
          onStop={() => {
            handlers.onStop();
            setPendingAction('stop');
          }}
        />
      );
    }

    render(<PendingHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stopping...' }));

    expect(handlers.onStop).toHaveBeenCalledTimes(1);
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

  it('disables stopped-agent controls while a start request is pending', () => {
    render(<AgentActionBar status="stopped" hasLinkedRun={true} pendingAction="start" {...handlers} />);

    expect(screen.getByRole('button', { name: 'Starting...' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Resume' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Starting...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onResume).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('guards duplicate stopped-agent action clicks after a request enters pending state', () => {
    function PendingHarness() {
      const [pendingAction, setPendingAction] = useState<AgentLifecycleAction | null>(null);
      return (
        <AgentActionBar
          status="stopped"
          hasLinkedRun={true}
          pendingAction={pendingAction}
          {...handlers}
          onStart={() => {
            handlers.onStart();
            setPendingAction('start');
          }}
        />
      );
    }

    render(<PendingHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starting...' }));

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
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

  it('shows a stop control and approval handoff for an agent awaiting approval', () => {
    render(<AgentActionBar status="awaiting_approval" hasLinkedRun={true} {...handlers} />);

    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.getByText('Approval required')).toBeTruthy();
    expect(screen.getByText('Resolve the pending approval in the linked chat, or stop the agent to cancel it.')).toBeTruthy();
    expect(screen.queryByText('Start')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByText('Kill')).toBeNull();
  });

  it('disables awaiting-approval controls while a stop request is pending', () => {
    render(<AgentActionBar status="awaiting_approval" hasLinkedRun={true} pendingAction="stop" {...handlers} />);

    expect(screen.getByRole('button', { name: 'Stopping...' }).getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stopping...' }));

    expect(handlers.onStop).not.toHaveBeenCalled();
  });

  it('shows a non-operable deleted state without lifecycle controls', () => {
    render(<AgentActionBar status="deleted" hasLinkedRun={true} {...handlers} />);

    expect(screen.getByText('Agent deleted')).toBeTruthy();
    expect(screen.queryByText('Start')).toBeNull();
    expect(screen.queryByText('Stop')).toBeNull();
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
  });
});
