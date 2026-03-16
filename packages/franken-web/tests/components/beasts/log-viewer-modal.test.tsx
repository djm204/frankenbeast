import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LogViewerModal } from '../../../src/components/beasts/log-viewer-modal';

afterEach(cleanup);

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
});
