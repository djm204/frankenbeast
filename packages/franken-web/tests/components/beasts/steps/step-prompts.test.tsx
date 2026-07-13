import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import { StepPrompts } from '../../../../src/components/beasts/steps/step-prompts';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepPrompts', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders textarea for prompt text', () => {
    render(<StepPrompts />);
    expect(screen.getByLabelText(/prompt text/i)).toBeTruthy();
  });

  it('stores prompt text in Zustand', () => {
    render(<StepPrompts />);
    fireEvent.change(screen.getByLabelText(/prompt text/i), { target: { value: 'Test prompt' } });
    expect(useBeastStore.getState().stepValues[5]?.promptText).toBe('Test prompt');
  });

  it('renders file picker section with restricted markdown guidance', () => {
    render(<StepPrompts />);
    expect(screen.getByText('Files')).toBeTruthy();
    expect(screen.getByText(/Markdown files use restricted mode by default/i)).toBeTruthy();
  });

  it('preserves prompt edits made while selected files are being read', async () => {
    let resolveContent!: (value: string) => void;
    const slowFile = new File(['pending'], 'context.md', { type: 'text/markdown' });
    Object.defineProperty(slowFile, 'text', {
      value: () => new Promise<string>((resolve) => {
        resolveContent = resolve;
      }),
    });

    render(<StepPrompts />);

    fireEvent.change(screen.getByLabelText('Attach files'), { target: { files: [slowFile] } });
    fireEvent.change(screen.getByLabelText(/prompt text/i), { target: { value: 'Typed while loading' } });
    resolveContent('file content');

    await waitFor(() => {
      expect(useBeastStore.getState().stepValues[5]?.files).toHaveLength(1);
    });
    expect(useBeastStore.getState().stepValues[5]?.promptText).toBe('Typed while loading');
  });

  it('stores selected prompt files and removes them from Zustand state', async () => {
    render(<StepPrompts />);

    fireEvent.change(screen.getByLabelText('Attach files'), {
      target: { files: [new File(['agent context'], 'context.md', { type: 'text/markdown' })] },
    });

    await waitFor(() => {
      expect(useBeastStore.getState().stepValues[5]?.files).toEqual([
        {
          name: 'context.md',
          content: 'agent context',
          tokens: 4,
          health: 'good',
        },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove context.md' }));

    expect(useBeastStore.getState().stepValues[5]?.files).toEqual([]);
  });
});
