// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { BeastCatalogEntry } from '../../lib/beast-api';
import { useBeastStore } from '../../stores/beast-store';
import { WizardDialog } from './wizard-dialog';

type WizardDialogTestProps = Partial<ComponentProps<typeof WizardDialog>>;

const CATALOG: BeastCatalogEntry[] = [
  {
    id: 'design-interview',
    label: 'Design Interview',
    description: 'Draft a design document',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'goal', prompt: 'What should be designed?', kind: 'string', required: true },
      { key: 'outputPath', prompt: 'Where should the design be written?', kind: 'string', required: true },
    ],
  },
  {
    id: 'chunk-plan',
    label: 'Design Doc -> Chunk Creation',
    description: 'Create implementation chunks from a design document',
    executionModeDefault: 'process',
    interviewPrompts: [
      { key: 'designDocPath', prompt: 'Which design document should be chunked?', kind: 'file', required: true },
      { key: 'outputDir', prompt: 'Where should the chunk plan be written?', kind: 'directory', required: true },
    ],
  },
];

function renderWizard(props: WizardDialogTestProps = {}) {
  return render(
    <WizardDialog
      isOpen
      onClose={vi.fn()}
      onLaunch={vi.fn()}
      catalog={CATALOG}
      containerRuntime={{ available: true }}
      {...props}
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

    fireEvent.click(screen.getByRole('button', { name: /Design Doc -> Chunk Creation/ }));
    expect(screen.getByRole('alert').textContent).toContain('Design doc path is required');
    expect(screen.getByRole('alert').textContent).toContain('Output directory is required');

    fireEvent.change(screen.getByLabelText(/design document should be chunked/i), { target: { value: 'docs/design.md' } });
    fireEvent.change(screen.getByLabelText(/chunk plan be written/i), { target: { value: 'tasks/chunks' } });

    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
  });

  it('shows form view validation errors when launch is blocked', () => {
    const onLaunch = vi.fn();
    render(
      <WizardDialog
        isOpen
        onClose={vi.fn()}
        onLaunch={onLaunch}
        containerRuntime={{ available: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle form mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Launch Agent' }));

    expect(onLaunch).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Identity: Agent name is required');
    expect(screen.getByRole('alert').textContent).toContain('Workflow: Workflow type is required');
  });

  it('includes the review summary in form view before the launch action', () => {
    useBeastStore.getState().setStepValues(0, { name: 'Reviewable Agent' });
    useBeastStore.getState().setStepValues(1, {
      workflowType: 'design-interview',
      goal: 'Draft a launch plan',
      outputPath: 'docs/launch.md',
    });

    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle form mode' }));

    const reviewHeading = screen.getByRole('heading', { name: 'Review' });
    const launchButton = screen.getByRole('button', { name: 'Launch Agent' });

    expect(reviewHeading.compareDocumentPosition(launchButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Reviewable Agent')).toBeTruthy();
    expect(screen.getAllByText('Design Interview').length).toBeGreaterThan(0);
  });

  it('uses the footer launch control as the only review-step launch path while pending', () => {
    const onLaunch = vi.fn();
    const store = useBeastStore.getState();
    store.setStepValues(0, { name: 'Reviewable Agent' });
    store.setStepValues(1, {
      workflowType: 'design-interview',
      goal: 'Prevent duplicate launches',
      outputPath: 'docs/duplicate-launches.md',
    });
    store.markStepCompleted(6);
    store.setWizardStep(7);

    renderWizard({ onLaunch, launching: true });

    expect(screen.queryByRole('button', { name: 'Launch' })).toBeNull();
    const launchButton = screen.getByRole('button', { name: 'Launching...' });
    expect(launchButton).toHaveProperty('disabled', true);

    fireEvent.click(launchButton);

    expect(onLaunch).not.toHaveBeenCalled();
  });
});
