import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StepGit } from '../../../../src/components/beasts/steps/step-git';
import { useBeastStore } from '../../../../src/stores/beast-store';

describe('StepGit', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders 5 preset cards', () => {
    render(<StepGit />);
    expect(screen.getByText('One-shot')).toBeTruthy();
    expect(screen.getByText('Feature Branch')).toBeTruthy();
    expect(screen.getByText('Feature + Worktree')).toBeTruthy();
    expect(screen.getByText('YOLO on Main')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('selecting a preset stores it and pre-fills overrides', () => {
    render(<StepGit />);
    fireEvent.click(screen.getByText('Feature Branch'));
    const state = useBeastStore.getState().stepValues[6] as any;
    expect(state?.preset).toBe('feature-branch');
    expect(state?.baseBranch).toBe('main');
  });

  it('renders override fields', () => {
    useBeastStore.getState().setStepValues(6, { preset: 'feature-branch', baseBranch: 'main' });
    render(<StepGit />);
    expect(screen.getByLabelText(/base branch/i)).toBeTruthy();
  });
});
