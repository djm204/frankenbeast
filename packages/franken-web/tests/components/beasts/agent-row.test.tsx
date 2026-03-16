import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentRow } from '../../../src/components/beasts/agent-row';
import type { TrackedAgentSummary } from '../../../src/lib/beast-api';

afterEach(cleanup);

const agent = {
  id: 'agent-1',
  name: 'My Test Agent',
  definitionId: 'design-interview',
  status: 'running',
  source: 'dashboard',
  createdByUser: 'pfk',
  initAction: { kind: 'design-interview' as const, command: '/interview', config: {} },
  initConfig: {},
  createdAt: '2026-03-15T10:00:00Z',
  updatedAt: '2026-03-15T10:05:00Z',
} as TrackedAgentSummary & { name?: string };

describe('AgentRow', () => {
  it('renders compact density with name, status, and timestamp', () => {
    render(<AgentRow agent={agent} density="compact" selected={false} onClick={vi.fn()} />);
    expect(screen.getByText('My Test Agent')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders comfortable density with extra chips', () => {
    render(<AgentRow agent={agent} density="comfortable" selected={false} onClick={vi.fn()} />);
    expect(screen.getByText('design-interview')).toBeTruthy();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<AgentRow agent={agent} density="compact" selected={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('agent-1');
  });

  it('shows selected highlight', () => {
    const { container } = render(<AgentRow agent={agent} density="compact" selected={true} onClick={vi.fn()} />);
    expect((container.firstChild as HTMLElement)?.className).toContain('bg-beast-accent-soft');
  });
});
