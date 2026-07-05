import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptPane } from '../../src/components/transcript-pane.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setScrollMetrics(element: Element, metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(element, 'scrollTop', { configurable: true, value: metrics.scrollTop });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: metrics.clientHeight });
}

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

  it('preserves scroll position and offers a jump button when new messages arrive while scrolled up', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const firstMessage = { id: 'u1', role: 'user' as const, content: 'Original', timestamp: new Date().toISOString() };
    const { container, rerender } = render(<TranscriptPane messages={[firstMessage]} showTypingIndicator={false} />);
    scrollIntoView.mockClear();

    const body = container.querySelector('.transcript-pane__body');
    expect(body).toBeTruthy();
    setScrollMetrics(body!, { scrollHeight: 1000, scrollTop: 100, clientHeight: 300 });
    fireEvent.scroll(body!);

    rerender(
      <TranscriptPane
        messages={[
          firstMessage,
          { id: 'a1', role: 'assistant' as const, content: 'New reply', timestamp: new Date().toISOString() },
        ]}
        showTypingIndicator={false}
      />,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    const jumpButton = screen.getByRole('button', { name: /new messages/i });
    expect(jumpButton).toBeTruthy();

    fireEvent.click(jumpButton);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' });
  });

  it('does not show a jump button when the user scrolls up before new messages arrive', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    const { container } = render(
      <TranscriptPane
        messages={[{ id: 'u1', role: 'user' as const, content: 'Original', timestamp: new Date().toISOString() }]}
        showTypingIndicator={false}
      />,
    );

    const body = container.querySelector('.transcript-pane__body');
    expect(body).toBeTruthy();
    setScrollMetrics(body!, { scrollHeight: 1000, scrollTop: 100, clientHeight: 300 });
    fireEvent.scroll(body!);

    expect(screen.queryByRole('button', { name: /new messages/i })).toBeNull();
  });

  it('follows streamed content changes for the existing last message while pinned', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const { rerender } = render(
      <TranscriptPane
        messages={[{ id: 'a1', role: 'assistant' as const, content: 'Chunk', timestamp: new Date().toISOString() }]}
        showTypingIndicator={false}
      />,
    );
    scrollIntoView.mockClear();

    rerender(
      <TranscriptPane
        messages={[{ id: 'a1', role: 'assistant' as const, content: 'Chunk plus more streamed text', timestamp: new Date().toISOString() }]}
        showTypingIndicator={false}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'end' });
  });

  it('resets pinned scroll state when the conversation changes', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const { container, rerender } = render(
      <TranscriptPane
        messages={[{ id: 'u1', role: 'user' as const, content: 'Old session', timestamp: new Date().toISOString() }]}
        resetKey="session-1"
        showTypingIndicator={false}
      />,
    );

    const body = container.querySelector('.transcript-pane__body');
    expect(body).toBeTruthy();
    setScrollMetrics(body!, { scrollHeight: 1000, scrollTop: 100, clientHeight: 300 });
    fireEvent.scroll(body!);
    scrollIntoView.mockClear();

    rerender(<TranscriptPane messages={[]} resetKey="session-2" showTypingIndicator={false} />);

    expect(screen.queryByRole('button', { name: /new messages/i })).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'end' });
  });
});
