import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FilePicker, type PickedFile } from '../../../../src/components/beasts/shared/file-picker';

afterEach(cleanup);

const existingFile: PickedFile = {
  name: 'existing.md',
  content: 'already loaded',
  tokens: 4,
  health: 'good',
};

describe('FilePicker', () => {
  it('renders file input and selected files', () => {
    const files = [
      { name: 'test.md', content: 'hello world', tokens: 3, health: 'good' as const },
    ];
    render(<FilePicker files={files} onFilesChange={vi.fn()} onRemoveFile={vi.fn()} />);
    expect(screen.getByText('test.md')).toBeTruthy();
    expect(screen.getByText(/3 tokens/i)).toBeTruthy();
  });

  it('reads selected files, estimates tokens and health, appends them, and clears the input', async () => {
    const onFilesChange = vi.fn();
    render(
      <FilePicker
        files={[existingFile]}
        onFilesChange={onFilesChange}
        onRemoveFile={vi.fn()}
      />,
    );

    const largeContent = 'x'.repeat(16_000);
    const input = screen.getByLabelText('Attach files') as HTMLInputElement;
    const files = [
      new File(['hello beast'], 'notes.md', { type: 'text/markdown' }),
      new File([largeContent], 'large.txt', { type: 'text/plain' }),
    ];

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(onFilesChange).toHaveBeenCalledTimes(1));
    expect(onFilesChange).toHaveBeenCalledWith([
      existingFile,
      {
        name: 'notes.md',
        content: 'hello beast',
        tokens: 3,
        health: 'good',
      },
      {
        name: 'large.txt',
        content: largeContent,
        tokens: 4000,
        health: 'warning',
      },
    ]);
    expect(input.value).toBe('');
  });

  it('shows critical health indicator for large files', () => {
    const files = [
      { name: 'big.md', content: 'x'.repeat(80000), tokens: 20000, health: 'critical' as const },
    ];
    render(<FilePicker files={files} onFilesChange={vi.fn()} onRemoveFile={vi.fn()} />);
    expect(screen.getByText(/too large/i)).toBeTruthy();
  });
});
