import { MODULE_CONFIG_KEYS, type BeastCatalogEntry, type BeastContainerRuntimeStatus, type BeastExecutionMode } from '../../lib/beast-api';
import { findCatalogEntry, getPromptValue, isBlankCatalogValue } from './wizard-catalog';

export const WIZARD_SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git'] as const;

type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

interface PromptFile {
  name?: unknown;
  content?: unknown;
}

function resolveLaunchExecutionMode(
  workflow: Record<string, unknown> | undefined,
  selectedWorkflow: BeastCatalogEntry | undefined,
  containerRuntime: BeastContainerRuntimeStatus | undefined,
): BeastExecutionMode {
  const requestedMode = workflow?.executionMode === 'process' || workflow?.executionMode === 'container'
    ? workflow.executionMode
    : 'process';

  if (requestedMode === 'container' && (selectedWorkflow?.containerRuntime ?? containerRuntime)?.available === false) {
    return 'process';
  }

  return requestedMode;
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

function buildModuleConfig(modules: Record<string, unknown> | undefined): Record<string, boolean> | undefined {
  if (!modules) return undefined;

  const moduleConfig = Object.fromEntries(
    MODULE_CONFIG_KEYS.flatMap((key: string) => (typeof modules[key] === 'boolean' ? [[key, modules[key]]] : [])),
  );

  return Object.keys(moduleConfig).length > 0 ? moduleConfig : undefined;
}

function buildSelectedSkills(skills: Record<string, unknown> | undefined): string[] | undefined {
  if (!skills || !Array.isArray(skills.selectedSkills)) return undefined;
  return skills.selectedSkills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0);
}

function buildLlmConfig(llm: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!llm) return undefined;

  const llmConfig: Record<string, unknown> = {};
  const defaultConfig: Record<string, string> = {};
  if (typeof llm.defaultProvider === 'string' && llm.defaultProvider.trim().length > 0) {
    defaultConfig.provider = llm.defaultProvider;
  }
  if (typeof llm.defaultModel === 'string' && llm.defaultModel.trim().length > 0) {
    defaultConfig.model = llm.defaultModel;
  }
  if (Object.keys(defaultConfig).length > 0) {
    llmConfig.default = defaultConfig;
  }

  if (llm.overrides && typeof llm.overrides === 'object' && !Array.isArray(llm.overrides)) {
    const overrides = Object.fromEntries(
      Object.entries(llm.overrides as Record<string, Record<string, unknown>>).flatMap(([action, override]) => {
        if (override.useDefault !== false) return [];
        const actionConfig: Record<string, string> = {};
        if (typeof override.provider === 'string' && override.provider.trim().length > 0) {
          actionConfig.provider = override.provider;
        }
        if (typeof override.model === 'string' && override.model.trim().length > 0) {
          actionConfig.model = override.model;
        }
        return Object.keys(actionConfig).length > 0 ? [[action, actionConfig]] : [];
      }),
    );
    if (Object.keys(overrides).length > 0) {
      llmConfig.overrides = overrides;
    }
  }

  return Object.keys(llmConfig).length > 0 ? llmConfig : undefined;
}

function normalizeBranchPattern(value: string): string {
  const firstToken = value.search(/\{(?:agent-name|id)\}/);
  return firstToken >= 0 ? value.slice(0, firstToken) : value;
}

function buildGitConfig(git: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!git) return undefined;

  const gitConfig: Record<string, unknown> = {};
  for (const key of ['preset', 'baseBranch', 'branchPattern', 'mergeStrategy'] as const) {
    if (typeof git[key] === 'string' && git[key].trim().length > 0) {
      gitConfig[key] = key === 'branchPattern' ? normalizeBranchPattern(git[key]) : git[key];
    }
  }
  if (typeof git.prCreation === 'boolean') {
    gitConfig.prCreation = git.prCreation ? 'auto' : 'disabled';
  }

  return Object.keys(gitConfig).length > 0 ? gitConfig : undefined;
}

export function buildWizardLaunchConfig(
  stepValues: WizardStepValues,
  catalog?: readonly BeastCatalogEntry[],
  containerRuntime?: BeastContainerRuntimeStatus,
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
  const moduleConfig = buildModuleConfig(config.modules as Record<string, unknown> | undefined);
  if (moduleConfig) {
    config.moduleConfig = moduleConfig;
  }
  const selectedSkills = buildSelectedSkills(config.skills as Record<string, unknown> | undefined);
  if (selectedSkills !== undefined) {
    config.skills = selectedSkills;
  }
  const llmConfig = buildLlmConfig(config.llm as Record<string, unknown> | undefined);
  if (llmConfig) {
    config.llmConfig = llmConfig;
    delete config.llm;
  }
  const gitConfig = buildGitConfig(config.git as Record<string, unknown> | undefined);
  if (gitConfig) {
    config.gitConfig = gitConfig;
    delete config.git;
  }
  const promptFrontload = buildPromptFrontload(config.prompts as Record<string, unknown> | undefined);
  if (promptFrontload) {
    config.promptConfig = { text: promptFrontload };
    delete config.prompts;
  }
  config.executionMode = resolveLaunchExecutionMode(workflow, selectedWorkflow, containerRuntime);

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
