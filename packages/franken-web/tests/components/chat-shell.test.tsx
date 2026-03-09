import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChatShell } from '../../src/components/chat-shell.js';

vi.mock('../../src/hooks/use-chat-session.js', () => ({
  useChatSession: () => ({
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'Hello',
        timestamp: '2026-03-09T00:00:00Z',
        receipt: 'read',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Dispatch accepted.',
        timestamp: '2026-03-09T00:00:01Z',
        modelTier: 'cheap',
        streaming: false,
      },
    ],
    status: 'idle' as const,
    connectionStatus: 'connected' as const,
    tier: 'cheap',
    tokenTotals: { cheap: 5, premiumReasoning: 2, premiumExecution: 1 },
    costUsd: 0.42,
    sessionId: 'sess-1',
    projectId: 'test-project',
    pendingApproval: { description: 'Approve deploy', requestedAt: '2026-03-09T00:00:02Z' },
    activity: [
      { type: 'turn.execution.start', data: { taskDescription: 'Deploy' }, timestamp: '2026-03-09T00:00:03Z' },
    ],
    send: vi.fn(),
    approve: vi.fn(),
  }),
}));

afterEach(cleanup);

describe('ChatShell', () => {
  it('renders Frankenbeast dashboard branding and version', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);
    const nav = container.querySelector('[aria-label="Dashboard navigation"]');

    expect(screen.getByText('v0.9.0')).toBeDefined();
    expect(nav?.textContent).toContain('Chat');
    expect(nav?.textContent).toContain('Sessions');
    expect(nav?.textContent).toContain('Analytics');
  });

  it('renders the chat workspace inside the dashboard shell', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);

    expect(screen.getByText('Dispatch accepted.')).toBeDefined();
    expect(screen.getByRole('textbox')).toBeDefined();
    expect(screen.getByText('Approve deploy')).toBeDefined();
    expect(screen.getByText('turn.execution.start')).toBeDefined();
  });

  it('shows connection and session status in the top bar', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test-project" version="0.9.0" />);
    const topbar = container.querySelector('.topbar');

    expect(topbar?.textContent).toContain('connected');
    expect(topbar?.textContent).toContain('sess-1');
    expect(topbar?.textContent).toContain('test-project');
  });
});
