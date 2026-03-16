import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FilePicker } from '../../../../src/components/beasts/shared/file-picker';

afterEach(cleanup);

describe('FilePicker', () => {
  it('renders file input and selected files', () => {
    const files = [
      { name: 'test.md', content: 'hello world', tokens: 3, health: 'good' as const },
    ];
    render(<FilePicker files={files} onFilesChange={vi.fn()} onRemoveFile={vi.fn()} />);
    expect(screen.getByText('test.md')).toBeTruthy();
    expect(screen.getByText(/3 tokens/i)).toBeTruthy();
  });

  it('shows critical health indicator for large files', () => {
    const files = [
      { name: 'big.md', content: 'x'.repeat(80000), tokens: 20000, health: 'critical' as const },
    ];
    render(<FilePicker files={files} onFilesChange={vi.fn()} onRemoveFile={vi.fn()} />);
    expect(screen.getByText(/too large/i)).toBeTruthy();
  });
});
