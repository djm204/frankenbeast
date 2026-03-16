import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StepPrompts } from '../../../../src/components/beasts/steps/step-prompts';
import { useBeastStore } from '../../../../src/stores/beast-store';

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

  it('renders file picker section', () => {
    render(<StepPrompts />);
    expect(screen.getByText('Files')).toBeTruthy();
  });
});
