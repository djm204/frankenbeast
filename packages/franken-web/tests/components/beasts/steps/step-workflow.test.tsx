import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StepWorkflow } from '../../../../src/components/beasts/steps/step-workflow';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepWorkflow', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders 4 workflow cards', () => {
    render(<StepWorkflow />);
    expect(screen.getByText('Design Interview')).toBeTruthy();
    expect(screen.getByText('Chunk Design Doc')).toBeTruthy();
    expect(screen.getByText('Issues Agent')).toBeTruthy();
    expect(screen.getByText('Run Chunked Project')).toBeTruthy();
  });

  it('selecting a card highlights it and stores in Zustand', () => {
    render(<StepWorkflow />);
    fireEvent.click(screen.getByText('Design Interview'));
    expect(useBeastStore.getState().stepValues[1]?.workflowType).toBe('design-interview');
  });

  it('shows workflow-specific fields after selection', () => {
    useBeastStore.getState().setStepValues(1, { workflowType: 'design-interview' });
    render(<StepWorkflow />);
    expect(screen.getByPlaceholderText(/topic|context/i)).toBeTruthy();
  });
});
