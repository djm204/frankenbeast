import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { StepSkills } from '../../../../src/components/beasts/steps/step-skills';
import { useBeastStore } from '../../../../src/stores/beast-store';
import { useDashboardStore } from '../../../../src/stores/dashboard-store';

const snapshotSecurity = {
  profile: 'standard',
  injectionDetection: true,
  piiMasking: true,
  outputValidation: true,
};

function seedSkills() {
  useDashboardStore.getState().setSnapshot({
    skills: [
      { name: 'code-review', enabled: true, hasContext: true, mcpServerCount: 1 },
      { name: 'runtime-only', enabled: true, hasContext: false, mcpServerCount: 0 },
      { name: 'disabled-runtime', enabled: false, hasContext: false, mcpServerCount: 0 },
    ],
    security: snapshotSecurity,
    providers: [],
  });
}

describe('StepSkills', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
    useDashboardStore.getState().reset();
    seedSkills();
  });

  afterEach(() => {
    cleanup();
    useBeastStore.getState().resetWizard();
    useDashboardStore.getState().reset();
  });

  it('renders the live runtime skill inventory instead of static placeholders', () => {
    render(<StepSkills />);
    expect(screen.getByPlaceholderText(/search skills/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /code-review/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /runtime-only/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /disabled-runtime/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /test generation/i })).toBeNull();
  });

  it('adds and removes a skill via pointer interaction', () => {
    render(<StepSkills />);
    const codeReview = screen.getByRole('button', { name: /code-review/i });

    fireEvent.click(codeReview);
    expect(codeReview.getAttribute('aria-pressed')).toBe('true');
    expect(useBeastStore.getState().stepValues[4]?.selectedSkills).toEqual(['code-review']);
    const selectedChipRemove = screen.getByLabelText('Remove code-review');
    expect(selectedChipRemove).toBeTruthy();

    fireEvent.click(selectedChipRemove);
    expect(codeReview.getAttribute('aria-pressed')).toBe('false');
  });

  it('supports keyboard activation and accessible removal flow for selected skills', () => {
    render(<StepSkills />);
    const codeReview = screen.getByRole('button', { name: /code-review/i });

    expect(codeReview.getAttribute('aria-pressed')).toBe('false');
    codeReview.focus();
    fireEvent.keyDown(codeReview, { key: 'Enter', code: 'Enter' });
    expect(codeReview.getAttribute('aria-pressed')).toBe('true');

    const selectedChipRemove = screen.getByLabelText('Remove code-review');
    expect(selectedChipRemove).toBeTruthy();
    selectedChipRemove.focus();
    fireEvent.keyDown(selectedChipRemove, { key: 'Enter', code: 'Enter' });
    expect(codeReview.getAttribute('aria-pressed')).toBe('false');

    fireEvent.keyDown(codeReview, { key: ' ', code: 'Space', charCode: 32 });
    expect(codeReview.getAttribute('aria-pressed')).toBe('true');

    fireEvent.keyDown(codeReview, { key: ' ', code: 'Space', charCode: 32 });
    expect(codeReview.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps aria-pressed in sync when a skill is toggled', () => {
    render(<StepSkills />);
    const skill = screen.getByRole('button', { name: /code-review/i });

    expect(skill.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(skill);
    expect(skill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(skill);
    expect(skill.getAttribute('aria-pressed')).toBe('false');
  });

  it('announces loading, failure, and successful empty inventory states', () => {
    useDashboardStore.getState().reset();
    const { rerender } = render(<StepSkills />);
    expect(screen.getByRole('status').textContent).toMatch(/loading installed skills/i);

    useDashboardStore.getState().setError('Inventory request failed.');
    rerender(<StepSkills />);
    expect(screen.getByRole('alert').textContent).toMatch(/inventory request failed/i);

    useDashboardStore.getState().setSnapshot({
      skills: [
        { name: 'disabled-runtime', enabled: false, hasContext: false, mcpServerCount: 0 },
      ],
      security: snapshotSecurity,
      providers: [],
    });
    rerender(<StepSkills />);
    expect(screen.getByRole('status').textContent).toMatch(/no enabled installed skills are available/i);
  });

  it('filters the runtime inventory without changing persisted skill IDs', () => {
    render(<StepSkills />);
    fireEvent.change(screen.getByLabelText(/search installed skills/i), { target: { value: 'runtime' } });

    expect(screen.getByRole('button', { name: /runtime-only/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /code-review/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /runtime-only/i }));
    expect(useBeastStore.getState().stepValues[4]?.selectedSkills).toEqual(['runtime-only']);
  });
});
