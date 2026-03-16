import { describe, it, expect, beforeEach } from 'vitest';
import { useBeastStore } from './beast-store';

describe('beast-store wizardSlice', () => {
  beforeEach(() => {
    useBeastStore.getState().resetWizard();
  });

  it('initializes with step 0 and wizard mode', () => {
    const state = useBeastStore.getState();
    expect(state.wizardStep).toBe(0);
    expect(state.wizardMode).toBe('wizard');
  });

  it('advances step and blocks past highest completed', () => {
    const { nextStep, setWizardStep } = useBeastStore.getState();
    nextStep(); // 0 → 1
    expect(useBeastStore.getState().wizardStep).toBe(1);
    setWizardStep(0); // back to 0 allowed
    expect(useBeastStore.getState().wizardStep).toBe(0);
    setWizardStep(5); // jump past completed blocked
    expect(useBeastStore.getState().wizardStep).toBe(0);
  });

  it('stores and retrieves form values per step', () => {
    const { setStepValues } = useBeastStore.getState();
    setStepValues(0, { name: 'TestAgent', description: 'A test' });
    expect(useBeastStore.getState().stepValues[0]).toEqual({ name: 'TestAgent', description: 'A test' });
  });

  it('toggles between wizard and form mode preserving state', () => {
    const { setStepValues, toggleWizardMode } = useBeastStore.getState();
    setStepValues(0, { name: 'Keep' });
    toggleWizardMode();
    expect(useBeastStore.getState().wizardMode).toBe('form');
    expect(useBeastStore.getState().stepValues[0]).toEqual({ name: 'Keep' });
  });
});

describe('beast-store agentEditSlice', () => {
  beforeEach(() => {
    useBeastStore.getState().resetEdit();
  });

  it('is not dirty when snapshot matches current', () => {
    const { setEditSnapshot, setEditValues } = useBeastStore.getState();
    const data = { name: 'Agent1', description: 'desc' };
    setEditSnapshot(data);
    setEditValues(data);
    expect(useBeastStore.getState().isEditDirty).toBe(false);
  });

  it('is dirty when current diverges from snapshot', () => {
    const { setEditSnapshot, setEditValues } = useBeastStore.getState();
    setEditSnapshot({ name: 'Agent1' });
    setEditValues({ name: 'Agent1-modified' });
    expect(useBeastStore.getState().isEditDirty).toBe(true);
  });
});
