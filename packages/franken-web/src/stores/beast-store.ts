import { create } from 'zustand';

type WizardMode = 'wizard' | 'form';

interface StepValues {
  [stepIndex: number]: Record<string, unknown>;
}

interface ValidationErrors {
  [stepIndex: number]: Record<string, string>;
}

interface WizardSlice {
  wizardStep: number;
  highestCompleted: number;
  wizardMode: WizardMode;
  stepValues: StepValues;
  validationErrors: ValidationErrors;
  nextStep: () => void;
  prevStep: () => void;
  setWizardStep: (step: number) => void;
  setStepValues: (step: number, values: Record<string, unknown>) => void;
  setValidationErrors: (step: number, errors: Record<string, string>) => void;
  clearValidationErrors: (step: number) => void;
  toggleWizardMode: () => void;
  markStepCompleted: (step: number) => void;
  resetWizard: () => void;
}

interface AgentEditSlice {
  editSnapshot: Record<string, unknown> | null;
  editValues: Record<string, unknown> | null;
  isEditDirty: boolean;
  setEditSnapshot: (snapshot: Record<string, unknown>) => void;
  setEditValues: (values: Record<string, unknown>) => void;
  setEditField: (key: string, value: unknown) => void;
  resetEdit: () => void;
}

type BeastStore = WizardSlice & AgentEditSlice;

function computeDirty(
  snapshot: Record<string, unknown> | null,
  values: Record<string, unknown> | null,
): boolean {
  if (!snapshot || !values) return false;
  return JSON.stringify(snapshot) !== JSON.stringify(values);
}

export const useBeastStore = create<BeastStore>()((set, get) => ({
  // Wizard slice
  wizardStep: 0,
  highestCompleted: -1,
  wizardMode: 'wizard' as WizardMode,
  stepValues: {},
  validationErrors: {},

  nextStep: () =>
    set((s) => ({
      wizardStep: s.wizardStep + 1,
      highestCompleted: Math.max(s.highestCompleted, s.wizardStep),
    })),

  prevStep: () =>
    set((s) => ({ wizardStep: Math.max(0, s.wizardStep - 1) })),

  setWizardStep: (step) =>
    set((s) => ({
      wizardStep: step <= s.highestCompleted + 1 ? step : s.wizardStep,
    })),

  setStepValues: (step, values) =>
    set((s) => ({
      stepValues: { ...s.stepValues, [step]: values },
    })),

  setValidationErrors: (step, errors) =>
    set((s) => ({
      validationErrors: { ...s.validationErrors, [step]: errors },
    })),

  clearValidationErrors: (step) =>
    set((s) => {
      const next = { ...s.validationErrors };
      delete next[step];
      return { validationErrors: next };
    }),

  toggleWizardMode: () =>
    set((s) => ({
      wizardMode: s.wizardMode === 'wizard' ? 'form' : 'wizard',
    })),

  markStepCompleted: (step) =>
    set((s) => ({
      highestCompleted: Math.max(s.highestCompleted, step),
    })),

  resetWizard: () =>
    set({
      wizardStep: 0,
      highestCompleted: -1,
      wizardMode: 'wizard' as WizardMode,
      stepValues: {},
      validationErrors: {},
    }),

  // Agent edit slice
  editSnapshot: null,
  editValues: null,
  isEditDirty: false,

  setEditSnapshot: (snapshot) =>
    set((s) => ({
      editSnapshot: snapshot,
      editValues: s.editValues ?? { ...snapshot },
      isEditDirty: computeDirty(snapshot, s.editValues ?? snapshot),
    })),

  setEditValues: (values) =>
    set((s) => ({
      editValues: values,
      isEditDirty: computeDirty(s.editSnapshot, values),
    })),

  setEditField: (key, value) => {
    const current = get().editValues ?? {};
    const next = { ...current, [key]: value };
    set((s) => ({
      editValues: next,
      isEditDirty: computeDirty(s.editSnapshot, next),
    }));
  },

  resetEdit: () =>
    set({ editSnapshot: null, editValues: null, isEditDirty: false }),
}));
