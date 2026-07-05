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
});
