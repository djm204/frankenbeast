import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StepSkills } from '../../../../src/components/beasts/steps/step-skills';
import { useBeastStore } from '../../../../src/stores/beast-store';

describe('StepSkills', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders available skill cards and search input', () => {
    render(<StepSkills />);
    expect(screen.getByPlaceholderText(/search skills/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /code review/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /test generation/i })).toBeTruthy();
  });

  it('adds and removes a skill via pointer interaction', () => {
    render(<StepSkills />);
    const codeReview = screen.getByRole('button', { name: /code review/i });

    fireEvent.click(codeReview);
    expect(codeReview.getAttribute('aria-pressed')).toBe('true');
    const selectedChipRemove = screen.getByLabelText('Remove Code Review');
    expect(selectedChipRemove).toBeTruthy();

    fireEvent.click(selectedChipRemove);
    expect(codeReview.getAttribute('aria-pressed')).toBe('false');
  });

  it('supports keyboard activation and accessible removal flow for selected skills', () => {
    render(<StepSkills />);
    const codeReview = screen.getByRole('button', { name: /code review/i });

    expect(codeReview.getAttribute('aria-pressed')).toBe('false');
    codeReview.focus();
    fireEvent.keyDown(codeReview, { key: 'Enter', code: 'Enter' });
    expect(codeReview.getAttribute('aria-pressed')).toBe('true');

    const selectedChipRemove = screen.getByLabelText('Remove Code Review');
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
    const skill = screen.getByRole('button', { name: /code review/i });

    expect(skill.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(skill);
    expect(skill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(skill);
    expect(skill.getAttribute('aria-pressed')).toBe('false');
  });
});
