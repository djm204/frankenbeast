export const WIZARD_SECTION_LABELS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git', 'Review'] as const;

export type WizardValidationErrors = Record<string, string>;
type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

type WorkflowValues = {
  workflowType?: unknown;
  docPath?: unknown;
  outputDir?: unknown;
  repoUrl?: unknown;
  chunkDir?: unknown;
};

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

export function validateWizardStep(step: number, stepValues: WizardStepValues): WizardValidationErrors {
  const errors: WizardValidationErrors = {};

  if (step === 0) {
    const values = stepValues[0] as { name?: unknown } | undefined;
    if (isBlank(values?.name)) {
      errors.name = 'Agent name is required.';
    }
  }

  if (step === 1) {
    const values = (stepValues[1] ?? {}) as WorkflowValues;
    if (isBlank(values.workflowType)) {
      errors.workflowType = 'Workflow type is required.';
    }

    if (values.workflowType === 'chunk-plan') {
      if (isBlank(values.docPath)) {
        errors.docPath = 'Design doc path is required.';
      }
      if (isBlank(values.outputDir)) {
        errors.outputDir = 'Output directory is required.';
      }
    }

    if (values.workflowType === 'issues-agent' && isBlank(values.repoUrl)) {
      errors.repoUrl = 'Repository URL is required.';
    }

    if (values.workflowType === 'martin-loop' && isBlank(values.chunkDir)) {
      errors.chunkDir = 'Chunk directory path is required.';
    }
  }

  if (step === 7) {
    for (let i = 0; i < WIZARD_SECTION_LABELS.length - 1; i += 1) {
      const stepErrors = validateWizardStep(i, stepValues);
      for (const [field, message] of Object.entries(stepErrors)) {
        errors[`${i}.${field}`] = `${WIZARD_SECTION_LABELS[i]}: ${message}`;
      }
    }
  }

  return errors;
}

export function getFirstInvalidWizardStep(stepValues: WizardStepValues): number | null {
  for (let i = 0; i < WIZARD_SECTION_LABELS.length - 1; i += 1) {
    if (Object.keys(validateWizardStep(i, stepValues)).length > 0) {
      return i;
    }
  }
  return null;
}

export function isWizardStepValid(step: number, stepValues: WizardStepValues): boolean {
  return Object.keys(validateWizardStep(step, stepValues)).length === 0;
}
