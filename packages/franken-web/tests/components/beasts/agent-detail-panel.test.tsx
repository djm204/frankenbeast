import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentDetailPanel } from '../../../src/components/beasts/agent-detail-panel';
import { useBeastStore } from '../../../src/stores/beast-store';

afterEach(cleanup);

const detail = {
  agent: {
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
  events: [],
};

const handlers = {
  onStart: vi.fn(),
  onStop: vi.fn(),
  onRestart: vi.fn(),
  onResume: vi.fn(),
  onDelete: vi.fn(),
  onKill: vi.fn(),
  onClose: vi.fn(),
};

describe('AgentDetailPanel', () => {
  beforeEach(() => {
    useBeastStore.getState().resetEdit();
  });

  it('renders readonly view by default', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('Overview')).toBeTruthy();
  });

  it('shows agent id in header', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('agent-1')).toBeTruthy();
  });

  it('has mode toggle', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('Readonly')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('shows action bar with status-appropriate buttons', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    expect(screen.getByText('Stop')).toBeTruthy();
  });

  it('shows edit form when Edit mode is selected', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    fireEvent.click(screen.getByText('Edit'));
    // Should show Identity section from edit form
    expect(screen.getByText('Identity')).toBeTruthy();
  });

  it('calls onClose when close button clicked', () => {
    render(<AgentDetailPanel isOpen={true} detail={detail} logs={[]} {...handlers} />);
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(handlers.onClose).toHaveBeenCalled();
  });
});
