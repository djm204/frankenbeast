import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StepModules } from '../../../../src/components/beasts/steps/step-modules';
import { useBeastStore } from '../../../../src/stores/beast-store';

afterEach(cleanup);

describe('StepModules', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('renders 7 module cards', () => {
    render(<StepModules />);
    expect(screen.getByText('Firewall')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getByText('Critique')).toBeTruthy();
    expect(screen.getByText('Governor')).toBeTruthy();
    expect(screen.getByText('Heartbeat')).toBeTruthy();
  });

  it('toggling a module stores state in Zustand', () => {
    render(<StepModules />);
    fireEvent.click(screen.getByText('Firewall'));
    const modules = useBeastStore.getState().stepValues[3] as Record<string, boolean>;
    expect(modules?.firewall).toBe(true);
  });
});
