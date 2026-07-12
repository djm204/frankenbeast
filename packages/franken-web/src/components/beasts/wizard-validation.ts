import type { BeastCatalogEntry, BeastInterviewPrompt } from '../../lib/beast-api';
import { findCatalogEntry, getPromptValue, isBlankCatalogValue } from './wizard-catalog';

export const WIZARD_SECTION_LABELS = ['Identity', 'Workflow', 'LLM Targets', 'Modules', 'Skills', 'Prompts', 'Git', 'Review'] as const;

export type WizardValidationErrors = Record<string, string>;
type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

type WorkflowValues = {
  workflowType?: unknown;
  goal?: unknown;
  topic?: unknown;
  outputPath?: unknown;
  designDocPath?: unknown;
  docPath?: unknown;
  outputDir?: unknown;
  provider?: unknown;
  objective?: unknown;
  chunkDirectory?: unknown;
  chunkDir?: unknown;
};

const MODULE_NUMERIC_FIELDS = [
  {
    moduleKey: 'planner',
    configKey: 'plannerConfig',
    field: 'maxDagDepth',
    label: 'Max DAG Depth',
    min: 1,
    max: 50,
  },
  {
    moduleKey: 'planner',
    configKey: 'plannerConfig',
    field: 'parallelTaskLimit',
    label: 'Parallel Task Limit',
    min: 1,
    max: 20,
  },
  {
    moduleKey: 'critique',
    configKey: 'critiqueConfig',
    field: 'maxIterations',
    label: 'Max Iterations',
    min: 1,
    max: 10,
  },
  {
    moduleKey: 'heartbeat',
    configKey: 'heartbeatConfig',
    field: 'reflectionInterval',
    label: 'Reflection Interval',
    min: 10,
    max: 600,
  },
] as const;

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function hasUnsafeRepoPathSegments(value: string): boolean {
  if (value.includes('\0')) return true;
  if (value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return true;
  return value.split(/[\\/]+/).includes('..');
}

function isBrowserFakePath(value: string): boolean {
  return /^(?:[a-zA-Z]:)?[\\/]*fakepath[\\/]/i.test(value);
}

function isRepoRelativeMarkdownDesignDocPath(value: string): boolean {
  if (hasUnsafeRepoPathSegments(value)) return false;
  return /\.(?:md|mdx|markdown)$/i.test(value);
}

function isDirectoryPathPrompt(prompt: BeastInterviewPrompt): boolean {
  const key = prompt.key.toLowerCase();
  return prompt.kind === 'directory' || key.includes('dir') || key.includes('directory');
}

function isPathPrompt(prompt: BeastInterviewPrompt): boolean {
  const key = prompt.key.toLowerCase();
  return prompt.kind === 'file' || isDirectoryPathPrompt(prompt) || key.includes('path');
}

function requiredMessage(prompt: BeastInterviewPrompt): string {
  if (prompt.key === 'goal') return 'Design interview goal is required.';
  if (prompt.key === 'outputPath') return 'Design interview output path is required.';
  if (prompt.key === 'designDocPath') return 'Design doc path is required.';
  if (prompt.key === 'outputDir') return 'Output directory is required.';
  if (prompt.key === 'provider') return 'Provider is required.';
  if (prompt.key === 'objective') return 'Objective is required.';
  if (prompt.key === 'chunkDirectory') return 'Chunk directory path is required.';
  return `${prompt.prompt.replace(/[?.!]+$/g, '')} is required.`;
}

function validateCatalogPrompt(
  errors: WizardValidationErrors,
  values: WorkflowValues,
  prompt: BeastInterviewPrompt,
): void {
  const value = getPromptValue(values as Record<string, unknown>, prompt);
  const errorKey = prompt.key === 'chunkDirectory' ? 'chunkDir' : prompt.key;
  if (prompt.required && isBlankCatalogValue(value)) {
    errors[errorKey] = requiredMessage(prompt);
    return;
  }
  if (prompt.key === 'designDocPath' && typeof value === 'string' && !isRepoRelativeMarkdownDesignDocPath(value)) {
    errors.designDocPath = 'Design doc path must be a repo-relative Markdown file without traversal.';
  }
  if (!errors[errorKey] && isPathPrompt(prompt) && typeof value === 'string' && hasUnsafeRepoPathSegments(value)) {
    errors[errorKey] = 'Path must be a repo-relative path without traversal.';
  }
  if (isDirectoryPathPrompt(prompt) && typeof value === 'string' && (isBrowserFakePath(value) || hasUnsafeRepoPathSegments(value))) {
    errors[errorKey] = isBrowserFakePath(value)
      ? 'Directory path must be a repo-relative path, not a browser fake path.'
      : 'Directory path must be a repo-relative path without traversal.';
  }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addModuleNumericErrors(errors: WizardValidationErrors, values: Record<string, unknown> | undefined): void {
  if (!values) return;

  for (const fieldSpec of MODULE_NUMERIC_FIELDS) {
    if (values[fieldSpec.moduleKey] !== true) continue;

    const config = values[fieldSpec.configKey];
    if (config === undefined) continue;
    if (!isRecordObject(config)) {
      errors[fieldSpec.configKey] = `${fieldSpec.label} configuration is malformed.`;
      continue;
    }
    if (!(fieldSpec.field in config)) continue;

    const value = config[fieldSpec.field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < fieldSpec.min || value > fieldSpec.max) {
      errors[`${fieldSpec.configKey}.${fieldSpec.field}`] = `${fieldSpec.label} must be a whole number from ${fieldSpec.min} to ${fieldSpec.max}.`;
    }
  }
}

export function validateWizardStep(
  step: number,
  stepValues: WizardStepValues,
  catalog?: readonly BeastCatalogEntry[],
): WizardValidationErrors {
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

    const workflowType = typeof values.workflowType === 'string' ? values.workflowType : undefined;
    const selectedDefinition = findCatalogEntry(catalog, workflowType);
    if (workflowType && !selectedDefinition) {
      errors.workflowType = 'Choose a supported launch workflow.';
    }

    for (const prompt of selectedDefinition?.interviewPrompts ?? []) {
      validateCatalogPrompt(errors, values, prompt);
    }
  }

  if (step === 3) {
    addModuleNumericErrors(errors, stepValues[3]);
  }

  if (step === 7) {
    for (let i = 0; i < WIZARD_SECTION_LABELS.length - 1; i += 1) {
      const stepErrors = validateWizardStep(i, stepValues, catalog);
      for (const [field, message] of Object.entries(stepErrors)) {
        errors[`${i}.${field}`] = `${WIZARD_SECTION_LABELS[i]}: ${message}`;
      }
    }
  }

  return errors;
}

export function getFirstInvalidWizardStep(
  stepValues: WizardStepValues,
  catalog?: readonly BeastCatalogEntry[],
): number | null {
  for (let i = 0; i < WIZARD_SECTION_LABELS.length - 1; i += 1) {
    if (Object.keys(validateWizardStep(i, stepValues, catalog)).length > 0) {
      return i;
    }
  }
  return null;
}

export function isWizardStepValid(
  step: number,
  stepValues: WizardStepValues,
  catalog?: readonly BeastCatalogEntry[],
): boolean {
  return Object.keys(validateWizardStep(step, stepValues, catalog)).length === 0;
}
