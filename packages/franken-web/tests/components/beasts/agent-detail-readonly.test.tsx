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

  it('renders mixed events and timestamped logs chronologically', () => {
    const mixedDetail = {
      ...detail,
      events: [
        {
          id: 'event-after',
          agentId: 'agent-1',
          sequence: 2,
          level: 'info' as const,
          type: 'agent.event',
          message: 'agent finished',
          payload: {},
          createdAt: '2026-03-15T10:02:00.000Z',
        },
        {
          id: 'event-before',
          agentId: 'agent-1',
          sequence: 1,
          level: 'info' as const,
          type: 'agent.event',
          message: 'agent started',
          payload: {},
          createdAt: '2026-03-15T10:00:00.000Z',
        },
      ],
    };

    render(<AgentDetailReadonly
      detail={mixedDetail}
      logs={[JSON.stringify({ stream: 'stdout', message: 'middle log line', createdAt: '2026-03-15T10:01:00.000Z' })]}
      onExpandLogs={vi.fn()}
    />);

    const entries = screen.getAllByText(/agent started|middle log line|agent finished/).map((entry) => entry.textContent);
    expect(entries).toEqual([
      expect.stringContaining('agent started'),
      expect.stringContaining('middle log line'),
      expect.stringContaining('agent finished'),
    ]);
  });
});
