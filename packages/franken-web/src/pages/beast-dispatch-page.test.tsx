// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeastCatalogEntry } from '../lib/beast-api';
import { BeastDispatchPage } from './beast-dispatch-page';

const catalog: BeastCatalogEntry[] = [
  {
    id: 'chunker',
    label: 'Chunker',
    description: 'Split a design doc into chunk tasks.',
    executionModeDefault: 'process',
    interviewPrompts: [
      {
        key: 'outputDirectory',
        prompt: 'Output Directory',
        kind: 'directory',
        required: true,
      },
    ],
  },
];

function renderPage(overrides: Partial<ComponentProps<typeof BeastDispatchPage>> = {}) {
  return render(
    <BeastDispatchPage
      catalog={catalog}
      disabled={false}
      error={null}
      onDelete={vi.fn()}
      onDispatch={vi.fn()}
      onKill={vi.fn()}
      onRefresh={vi.fn()}
      onRestart={vi.fn()}
      onResume={vi.fn()}
      onSelectAgent={vi.fn()}
      onStart={vi.fn()}
      onStop={vi.fn()}
      agentDetail={null}
      agents={[]}
      selectedAgentId={null}
      {...overrides}
    />,
  );
}

describe('BeastDispatchPage directory prompts', () => {
  afterEach(() => cleanup());

  it('asks for a server path directly instead of showing a browser directory picker', () => {
    renderPage();

    const directoryInput = screen.getByLabelText('Output Directory') as HTMLInputElement;

    expect(directoryInput.type).toBe('text');
    expect(directoryInput.placeholder).toBe('repo/path/to/directory');
    expect(screen.getByText(/repo-relative or server-accessible directory path/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /choose directory/i })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('submits the manually entered directory path', () => {
    const onDispatch = vi.fn();
    renderPage({ onDispatch });

    fireEvent.change(screen.getByLabelText('Output Directory'), { target: { value: 'tasks/chunks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Launch Chunker' }));

    expect(onDispatch).toHaveBeenCalledWith('chunker', { outputDirectory: 'tasks/chunks' }, undefined, 'process');
  });
});
