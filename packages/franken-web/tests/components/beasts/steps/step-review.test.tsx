import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StepReview } from '../../../../src/components/beasts/steps/step-review';
import { useBeastStore } from '../../../../src/stores/beast-store';

describe('StepReview', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
    useBeastStore.getState().setStepValues(0, { name: 'Test Agent', description: 'A test agent' });
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview' });
  });

  it('renders summary sections from Zustand state', () => {
    render(<StepReview />);
    expect(screen.getByText('Test Agent')).toBeTruthy();
    expect(screen.getByText(/design-interview/i)).toBeTruthy();
  });

  it('has edit links that call setWizardStep', () => {
    render(<StepReview />);
    const editLinks = screen.getAllByText('Edit');
    expect(editLinks.length).toBeGreaterThan(0);
    fireEvent.click(editLinks[0]!);
    // Should have changed wizardStep
    expect(useBeastStore.getState().wizardStep).toBe(0);
  });

  it('does not render a launch action inside the review step', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'chunk-plan', docPath: 'docs/design.md', outputDir: 'tasks/chunks' });
    useBeastStore.getState().setStepValues(2, { defaultProvider: 'codex', defaultModel: 'gpt-5.1' });
    render(<StepReview />);

    expect(screen.queryByRole('button', { name: /launch/i })).toBeNull();
    expect(screen.getByText('chunk-plan')).toBeTruthy();
    expect(screen.getByText('codex / gpt-5.1')).toBeTruthy();
  });
});
