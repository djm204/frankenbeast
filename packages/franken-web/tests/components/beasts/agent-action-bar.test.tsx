import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgentActionBar } from '../../../src/components/beasts/agent-action-bar';

afterEach(cleanup);

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
});
