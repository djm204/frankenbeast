import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StepLlmTargets } from '../../../../src/components/beasts/steps/step-llm-targets';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepLlmTargets', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders default provider/model selects', () => {
    render(<StepLlmTargets />);
    expect(screen.getAllByText(/default model/i).length).toBeGreaterThan(0);
  });

  it('renders per-action overrides section', () => {
    render(<StepLlmTargets />);
    expect(screen.getByText(/per-action overrides/i)).toBeTruthy();
  });

  it('shows gap banner for per-action routing', () => {
    render(<StepLlmTargets />);
    expect(screen.getByText(/per-action routing not yet wired/i)).toBeTruthy();
  });
});
