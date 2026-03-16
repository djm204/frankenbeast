import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    render(<StepReview onLaunch={vi.fn()} />);
    expect(screen.getByText('Test Agent')).toBeTruthy();
    expect(screen.getByText(/design-interview/i)).toBeTruthy();
  });

  it('has edit links that call setWizardStep', () => {
    render(<StepReview onLaunch={vi.fn()} />);
    const editLinks = screen.getAllByText('Edit');
    expect(editLinks.length).toBeGreaterThan(0);
    fireEvent.click(editLinks[0]!);
    // Should have changed wizardStep
    expect(useBeastStore.getState().wizardStep).toBe(0);
  });

  it('has Launch button that calls onLaunch', () => {
    const onLaunch = vi.fn();
    render(<StepReview onLaunch={onLaunch} />);
    fireEvent.click(screen.getByText('Launch'));
    expect(onLaunch).toHaveBeenCalled();
  });
});
