import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TranscriptPane } from '../../src/components/transcript-pane.js';

afterEach(cleanup);

describe('TranscriptPane', () => {
  it('renders messages with role labels', () => {
    const messages = [
      { id: 'u1', role: 'user' as const, content: 'Hello', timestamp: new Date().toISOString() },
      { id: 'a1', role: 'assistant' as const, content: 'Hi there!', timestamp: new Date().toISOString(), modelTier: 'cheap' },
    ];
    render(<TranscriptPane messages={messages} showTypingIndicator={false} />);

    expect(screen.getByText('Hello')).toBeDefined();
    expect(screen.getByText('Hi there!')).toBeDefined();
  });

  it('renders role labels for each message', () => {
    const messages = [
      { id: 'u1', role: 'user' as const, content: 'Test msg', timestamp: new Date().toISOString() },
      { id: 'a1', role: 'assistant' as const, content: 'Reply', timestamp: new Date().toISOString() },
    ];
    render(<TranscriptPane messages={messages} showTypingIndicator={false} />);

    expect(screen.getByText('user')).toBeDefined();
    expect(screen.getByText('assistant')).toBeDefined();
  });

  it('renders empty state when no messages', () => {
    const { container } = render(<TranscriptPane messages={[]} showTypingIndicator={false} />);
    // Should render without error, section should exist
    expect(container.querySelector('section')).not.toBeNull();
  });

  it('shows model tier badge on assistant messages', () => {
    const messages = [
      { id: 'a1', role: 'assistant' as const, content: 'Reply', timestamp: new Date().toISOString(), modelTier: 'premium_execution' },
    ];
    render(<TranscriptPane messages={messages} showTypingIndicator={false} />);
    expect(screen.getByText(/premium_execution/i)).toBeDefined();
  });

  it('does not show tier badge when modelTier is absent', () => {
    const messages = [
      { id: 'u1', role: 'user' as const, content: 'No tier', timestamp: new Date().toISOString() },
    ];
    render(<TranscriptPane messages={messages} showTypingIndicator={false} />);
    expect(screen.queryByText(/cheap|premium/i)).toBeNull();
  });
});
