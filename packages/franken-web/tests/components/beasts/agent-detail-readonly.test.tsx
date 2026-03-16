import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgentDetailReadonly } from '../../../src/components/beasts/agent-detail-readonly';

afterEach(cleanup);

const detail = {
  agent: {
    id: 'agent-1', definitionId: 'design-interview', status: 'running',
    source: 'dashboard', createdByUser: 'pfk',
    initAction: { kind: 'design-interview' as const, command: '/interview', config: {} },
    initConfig: {}, createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:05:00Z',
  },
  events: [],
};

describe('AgentDetailReadonly', () => {
  it('renders overview section with agent metadata', () => {
    render(<AgentDetailReadonly detail={detail} logs={[]} onExpandLogs={vi.fn()} />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText(/design-interview/)).toBeTruthy();
  });

  it('renders events & logs section', () => {
    render(<AgentDetailReadonly detail={detail} logs={['log line 1']} onExpandLogs={vi.fn()} />);
    expect(screen.getByText('Events & Logs')).toBeTruthy();
  });
});
