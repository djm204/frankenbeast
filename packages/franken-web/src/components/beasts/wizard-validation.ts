export const WIZARD_SECTION_LABELS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git', 'Review'] as const;

export type WizardValidationErrors = Record<string, string>;
type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

type WorkflowValues = {
  workflowType?: unknown;
  topic?: unknown;
  outputPath?: unknown;
  docPath?: unknown;
  outputDir?: unknown;
  provider?: unknown;
  objective?: unknown;
  chunkDir?: unknown;
};

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isRepoRelativeMarkdownDesignDocPath(value: string): boolean {
  if (value.includes('\0')) return false;
  if (value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return false;
  if (value.split(/[\\/]+/).includes('..')) return false;
  return /\.(?:md|mdx|markdown)$/i.test(value);
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

    if (values.workflowType === 'design-interview') {
      if (isBlank(values.topic)) {
        errors.topic = 'Design interview goal is required.';
      }
      if (isBlank(values.outputPath)) {
        errors.outputPath = 'Design interview output path is required.';
      }
    }

    if (values.workflowType === 'chunk-plan') {
      const docPath = values.docPath;
      if (isBlank(docPath)) {
        errors.docPath = 'Design doc path is required.';
      } else if (typeof docPath !== 'string' || !isRepoRelativeMarkdownDesignDocPath(docPath)) {
        errors.docPath = 'Design doc path must be a repo-relative Markdown file without traversal.';
      }
      if (isBlank(values.outputDir)) {
        errors.outputDir = 'Output directory is required.';
      }
    }

    if (values.workflowType === 'martin-loop') {
      if (isBlank(values.provider)) {
        errors.provider = 'Provider is required.';
      }
      if (isBlank(values.objective)) {
        errors.objective = 'Objective is required.';
      }
      if (isBlank(values.chunkDir)) {
        errors.chunkDir = 'Chunk directory path is required.';
      }
    }

    if (
      !isBlank(values.workflowType) &&
      values.workflowType !== 'design-interview' &&
      values.workflowType !== 'chunk-plan' &&
      values.workflowType !== 'martin-loop'
    ) {
      errors.workflowType = 'Choose a supported launch workflow.';
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
