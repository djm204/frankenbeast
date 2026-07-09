import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LogViewerModal } from '../../../src/components/beasts/log-viewer-modal';

function mockFullscreenApi({
  fullscreenElement = null,
  requestFullscreen,
  exitFullscreen,
}: {
  fullscreenElement?: Element | null;
  requestFullscreen?: Element['requestFullscreen'];
  exitFullscreen?: Document['exitFullscreen'];
}) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockFullscreenApi({ requestFullscreen: undefined, exitFullscreen: undefined });
});

describe('LogViewerModal', () => {
  it('renders logs when open', () => {
    render(<LogViewerModal isOpen={true} onClose={vi.fn()} logs={['line 1', 'line 2']} events={[]} />);
    expect(screen.getByText('line 1')).toBeTruthy();
    expect(screen.getByText('line 2')).toBeTruthy();
  });

  it('has search filter', () => {
    render(<LogViewerModal isOpen={true} onClose={vi.fn()} logs={['error: something', 'info: success']} events={[]} />);
    const search = screen.getByPlaceholderText(/search logs/i);
    fireEvent.change(search, { target: { value: 'error' } });
    expect(screen.getByText('error: something')).toBeTruthy();
    expect(screen.queryByText('info: success')).toBeNull();
  });

  it('disables fullscreen toggle when fullscreen is not supported', () => {
    mockFullscreenApi({ requestFullscreen: undefined, exitFullscreen: undefined });

    render(<LogViewerModal isOpen={true} onClose={vi.fn()} logs={[]} events={[]} />);

    const toggle = screen.getByRole('button', { name: /fullscreen is not supported/i });
    expect(toggle).toBeTruthy();
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces rejected fullscreen request without an unhandled rejection', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    mockFullscreenApi({
      requestFullscreen: vi.fn().mockRejectedValue(new Error('Permission denied')),
      exitFullscreen: vi.fn().mockResolvedValue(undefined),
    });

    render(<LogViewerModal isOpen={true} onClose={vi.fn()} logs={[]} events={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /enter fullscreen/i }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/fullscreen request failed: permission denied/i)).toBeTruthy();
    await waitFor(() => expect(unhandled).not.toHaveBeenCalled());
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('surfaces rejected fullscreen exit without an unhandled rejection', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    mockFullscreenApi({
      fullscreenElement: document.documentElement,
      requestFullscreen: vi.fn().mockResolvedValue(undefined),
      exitFullscreen: vi.fn().mockRejectedValue(new DOMException('Platform denied exit', 'NotAllowedError')),
    });

    render(<LogViewerModal isOpen={true} onClose={vi.fn()} logs={[]} events={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /exit fullscreen/i }));

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText(/fullscreen request failed: platform denied exit/i)).toBeTruthy();
    await waitFor(() => expect(unhandled).not.toHaveBeenCalled());
    window.removeEventListener('unhandledrejection', unhandled);
  });
});
