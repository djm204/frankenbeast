// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBeastStore } from '../../stores/beast-store';
import { WizardDialog } from './wizard-dialog';

function renderWizard() {
  return render(
    <WizardDialog
      isOpen
      onClose={vi.fn()}
      onLaunch={vi.fn()}
      containerRuntime={{ available: true }}
    />,
  );
}

describe('WizardDialog validation', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  afterEach(() => {
    cleanup();
  });

  it('blocks the Identity step Next action until required fields are valid', () => {
    renderWizard();

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('Agent name is required');
    expect(screen.getByLabelText('Identity has validation errors').textContent).toContain('!');

    fireEvent.change(screen.getByLabelText(/Agent Name/), { target: { value: 'Docs Agent' } });

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Design Interview')).toBeTruthy();
  });

  it('blocks workflow navigation until a workflow type and conditional fields are valid', () => {
    useBeastStore.getState().setStepValues(0, { name: 'Issue Agent' });
    useBeastStore.getState().nextStep();
    renderWizard();

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('Workflow type is required');

    fireEvent.click(screen.getByRole('button', { name: /Chunk Design Doc/ }));
    expect(screen.getByRole('alert').textContent).toContain('Design doc path is required');
    expect(screen.getByRole('alert').textContent).toContain('Output directory is required');

    fireEvent.change(screen.getByLabelText('Design Doc Path'), { target: { value: '/tmp/design.md' } });
    fireEvent.change(screen.getByLabelText('Output Directory'), { target: { value: '/tmp/chunks' } });

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
  });
});
