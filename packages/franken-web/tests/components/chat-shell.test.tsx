import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChatShell } from '../../src/components/chat-shell.js';

afterEach(cleanup);

// Mock useChatSession
vi.mock('../../src/hooks/use-chat-session.js', () => ({
  useChatSession: () => ({
    transcript: [
      { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
    ],
    status: 'idle' as const,
    tier: 'cheap',
    send: vi.fn(),
    approve: vi.fn(),
    sessionId: 'sess-1',
  }),
}));

describe('ChatShell', () => {
  it('renders transcript pane and composer', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test" />);
    expect(screen.getByText('Hello')).toBeDefined();
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('renders cost badge with current tier', () => {
    render(<ChatShell baseUrl="http://localhost:3000" projectId="test" />);
    // The tier value is rendered as exact text in a dd element
    const tierDd = screen.getByText('cheap');
    expect(tierDd).toBeDefined();
    expect(tierDd.tagName).toBe('DD');
  });

  it('renders two-column layout with main and aside', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test" />);
    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('aside')).not.toBeNull();
  });

  it('renders activity pane in aside', () => {
    const { container } = render(<ChatShell baseUrl="http://localhost:3000" projectId="test" />);
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
  });
});
