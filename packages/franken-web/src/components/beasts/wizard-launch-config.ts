import type { BeastCatalogEntry } from '../../lib/beast-api';
import { findCatalogEntry, getPromptValue, isBlankCatalogValue } from './wizard-catalog';

export const WIZARD_SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git'] as const;

type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

interface PromptFile {
  name?: unknown;
  content?: unknown;
}

function buildPromptFrontload(prompts: Record<string, unknown> | undefined): string | undefined {
  if (!prompts) return undefined;

  const parts: string[] = [];
  if (typeof prompts.promptText === 'string' && prompts.promptText.trim().length > 0) {
    parts.push(prompts.promptText.trim());
  }

  const files = Array.isArray(prompts.files) ? (prompts.files as PromptFile[]) : [];
  const fileSections = files.flatMap((file) => {
    if (typeof file.content !== 'string' || file.content.length === 0) return [];
    const name = typeof file.name === 'string' && file.name.trim().length > 0 ? file.name.trim() : 'attached-file';
    return [`Attached file: ${name}\n\n${file.content}`];
  });
  parts.push(...fileSections);

  return parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;
}

export function buildWizardLaunchConfig(
  stepValues: WizardStepValues,
  catalog?: readonly BeastCatalogEntry[],
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (let i = 0; i < WIZARD_SECTION_KEYS.length; i += 1) {
    if (stepValues[i]) {
      config[WIZARD_SECTION_KEYS[i]!] = stepValues[i];
    }
  }

  const workflow = config.workflow as Record<string, unknown> | undefined;
  const selectedWorkflow = typeof workflow?.workflowType === 'string'
    ? findCatalogEntry(catalog, workflow.workflowType)
    : undefined;
  const promptFrontload = buildPromptFrontload(config.prompts as Record<string, unknown> | undefined);
  if (promptFrontload) {
    config.promptConfig = { text: promptFrontload };
    delete config.prompts;
  }
  if (workflow?.executionMode === 'process' || workflow?.executionMode === 'container') {
    config.executionMode = workflow.executionMode;
  } else {
    config.executionMode = 'process';
  }

  if (selectedWorkflow && workflow) {
    for (const prompt of selectedWorkflow.interviewPrompts) {
      const value = getPromptValue(workflow, prompt);
      if (!isBlankCatalogValue(value)) {
        config[prompt.key] = value;
      }
    }
  }

  if (workflow?.workflowType === 'design-interview') {
    const goal = typeof workflow.goal === 'string' ? workflow.goal : workflow.topic;
    if (typeof goal === 'string') {
      config.goal = goal;
    }
    if (typeof workflow.outputPath === 'string') {
      config.outputPath = workflow.outputPath;
    }
  }

  if (workflow?.workflowType === 'chunk-plan') {
    const designDocPath = typeof workflow.designDocPath === 'string' ? workflow.designDocPath : workflow.docPath;
    if (typeof designDocPath === 'string') {
      config.designDocPath = designDocPath;
    }
    if (typeof workflow.outputDir === 'string') {
      config.outputDir = workflow.outputDir;
    }
  }

  if (workflow?.workflowType === 'martin-loop') {
    if (typeof workflow.provider === 'string') {
      config.provider = workflow.provider;
    }
    if (typeof workflow.objective === 'string') {
      config.objective = workflow.objective;
    }
    const chunkDirectory = typeof workflow.chunkDirectory === 'string' ? workflow.chunkDirectory : workflow.chunkDir;
    if (typeof chunkDirectory === 'string') {
      config.chunkDirectory = chunkDirectory;
    }
  }

  return config;
}
