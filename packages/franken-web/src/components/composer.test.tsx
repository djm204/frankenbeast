import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './composer';
import { TranscriptPane } from './transcript-pane';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Composer failed-send recovery', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the draft and offers retry when sending fails', async () => {
    const firstAttempt = deferred<void>();
    const onSend = vi.fn().mockReturnValueOnce(firstAttempt.promise).mockResolvedValueOnce(undefined);
    render(<Composer connectionStatus="connected" disabled={false} onSend={onSend} status="idle" />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'recover this prompt' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }));

    expect(onSend).toHaveBeenCalledWith('recover this prompt');
    expect(input.value).toBe('recover this prompt');

    firstAttempt.reject(new Error('Network dropped before ack'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Network dropped before ack');
    expect(input.value).toBe('recover this prompt');

    fireEvent.click(screen.getByRole('button', { name: 'Retry send' }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(2);
    });
    expect(onSend).toHaveBeenLastCalledWith('recover this prompt');
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('preserves edits made while a send is pending', async () => {
    const firstAttempt = deferred<void>();
    const onSend = vi.fn().mockReturnValueOnce(firstAttempt.promise);
    render(<Composer connectionStatus="connected" disabled={false} onSend={onSend} status="idle" />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'first prompt' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }));
    fireEvent.change(input, { target: { value: 'next prompt draft' } });

    firstAttempt.resolve(undefined);

    await waitFor(() => {
      expect(input.value).toBe('next prompt draft');
    });
  });

  it('clears a composer failure only when a matching transcript retry succeeds', async () => {
    const failedAttempt = deferred<void>();
    const onSend = vi.fn().mockReturnValueOnce(failedAttempt.promise);
    const { rerender } = render(<Composer connectionStatus="connected" disabled={false} onSend={onSend} status="idle" />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'retry from transcript' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }));
    failedAttempt.reject(new Error('Socket ack timed out'));

    await screen.findByRole('alert');
    rerender(
      <Composer
        clearedFailedDraft={{ content: 'retry from transcript', nonce: 1 }}
        connectionStatus="connected"
        disabled={false}
        onSend={onSend}
        status="idle"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
      expect(input.value).toBe('');
    });
  });

  it('keeps newer composer failures visible when a transcript retry clears an older failure', async () => {
    const oldFailedAttempt = deferred<void>();
    const newFailedAttempt = deferred<void>();
    const onSend = vi.fn()
      .mockReturnValueOnce(oldFailedAttempt.promise)
      .mockReturnValueOnce(newFailedAttempt.promise);
    const { rerender } = render(<Composer connectionStatus="connected" disabled={false} onSend={onSend} status="idle" />);

    const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'old failed draft' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }));
    oldFailedAttempt.reject(new Error('Old socket ack timed out'));
    await screen.findByRole('alert');

    fireEvent.change(input, { target: { value: 'new unrelated draft' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }));
    newFailedAttempt.reject(new Error('New socket ack timed out'));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('New socket ack timed out');
    });

    rerender(
      <Composer
        clearedFailedDraft={{ content: 'old failed draft', nonce: 1 }}
        connectionStatus="connected"
        disabled={false}
        onSend={onSend}
        status="idle"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('New socket ack timed out');
      expect(input.value).toBe('new unrelated draft');
    });
  });

  it('shows resend controls for failed user messages', () => {
    const onRetryMessage = vi.fn();
    render(
      <TranscriptPane
        messages={[
          {
            id: 'user-failed-1',
            role: 'user',
            content: 'retry this failed dispatch',
            timestamp: '2026-07-05T00:00:00.000Z',
            receipt: 'failed',
            error: 'Socket ack timed out',
          },
        ]}
        onRetryMessage={onRetryMessage}
        showTypingIndicator={false}
      />,
    );

    expect(screen.getByText('Socket ack timed out')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resend failed message' }));

    expect(onRetryMessage).toHaveBeenCalledWith('user-failed-1');
  });

  it('disables failed-message resends while another turn is active', () => {
    render(
      <TranscriptPane
        messages={[
          {
            id: 'user-failed-1',
            role: 'user',
            content: 'retry this failed dispatch',
            timestamp: '2026-07-05T00:00:00.000Z',
            receipt: 'failed',
            error: 'Socket ack timed out',
          },
        ]}
        onRetryMessage={vi.fn()}
        retryDisabled
        showTypingIndicator={false}
      />,
    );

    const button = screen.getByRole('button', { name: 'Resend failed message' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
