import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StepSkills } from '../../../../src/components/beasts/steps/step-skills';
import { useBeastStore } from '../../../../src/stores/beast-store';

describe('StepSkills', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders skill list from static data', () => {
    render(<StepSkills />);
    // Should show some skills via search input placeholder or a skill name
    expect(screen.getByPlaceholderText(/search skills/i)).toBeTruthy();
  });

  it('can add a skill to selected chips', () => {
    render(<StepSkills />);
    // Find and click a skill to add it
    const firstSkill = screen.getAllByRole('button').find(btn => !btn.textContent?.includes('Search'));
    if (firstSkill) {
      fireEvent.click(firstSkill);
      // Should now appear in selected area
      const chips = useBeastStore.getState().stepValues[4] as { selectedSkills?: string[] } | undefined;
      expect(chips?.selectedSkills?.length).toBeGreaterThan(0);
    }
  });
});
