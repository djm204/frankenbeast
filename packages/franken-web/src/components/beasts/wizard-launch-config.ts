import { MODULE_CONFIG_KEYS, type BeastCatalogEntry, type BeastContainerRuntimeStatus, type BeastExecutionMode } from '../../lib/beast-api';
import { findCatalogEntry, getPromptValue, isBlankCatalogValue } from './wizard-catalog';

export const WIZARD_SECTION_KEYS = ['identity', 'workflow', 'llm', 'modules', 'skills', 'prompts', 'git'] as const;

type WizardStepValues = Record<number, Record<string, unknown> | undefined>;

const MODULE_NUMBER_BOUNDS = {
  plannerConfig: {
    maxDagDepth: { min: 1, max: 50 },
    parallelTaskLimit: { min: 1, max: 20 },
  },
  critiqueConfig: {
    maxIterations: { min: 1, max: 10 },
  },
  heartbeatConfig: {
    reflectionInterval: { min: 10, max: 600 },
  },
} as const;

const CLI_PROVIDER_BY_WIZARD_PROVIDER: Record<string, string> = {
  anthropic: 'claude',
  'anthropic-api': 'claude',
  'claude-cli': 'claude',
  openai: 'codex',
  'openai-api': 'codex',
  'codex-cli': 'codex',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  'gemini-cli': 'gemini',
  aider: 'aider',
  claude: 'claude',
  codex: 'codex',
};

const GIT_PRESET_DEFAULTS: Record<string, Record<string, unknown>> = {
  'one-shot': { baseBranch: 'main', branchPattern: '', prCreation: false, commitConvention: 'conventional', mergeStrategy: 'merge' },
  'feature-branch': { baseBranch: 'main', branchPattern: 'feat/{agent-name}/{id}', prCreation: true, commitConvention: 'conventional', mergeStrategy: 'squash' },
  'feature-branch-worktree': { baseBranch: 'main', branchPattern: 'feat/{agent-name}/{id}', prCreation: true, commitConvention: 'conventional', mergeStrategy: 'squash' },
  'yolo-main': { baseBranch: 'main', branchPattern: '', prCreation: false, commitConvention: 'freeform', mergeStrategy: 'merge' },
};

interface PromptFile {
  name?: unknown;
  content?: unknown;
}

function stringRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function llmProviderModel(
  llmConfig: Record<string, unknown> | undefined,
  operation?: string,
): { provider?: string; model?: string } {
  const section = operation
    ? stringRecord(stringRecord(llmConfig?.overrides)?.[operation])
    : stringRecord(llmConfig?.default);
  const provider = typeof section?.provider === 'string' ? section.provider : undefined;
  const model = typeof section?.model === 'string' ? section.model : undefined;
  return { provider, model };
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

function sanitizeModuleNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value === 'string' && value.trim().length === 0) return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeModuleConfig(modules: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!modules) return undefined;

  const nextModules = { ...modules };
  for (const [configKey, fields] of Object.entries(MODULE_NUMBER_BOUNDS)) {
    const current = nextModules[configKey];
    if (!current || typeof current !== 'object' || Array.isArray(current)) continue;

    const nextConfig = { ...(current as Record<string, unknown>) };
    for (const [field, bounds] of Object.entries(fields)) {
      if (!(field in nextConfig)) continue;
      const sanitized = sanitizeModuleNumber(nextConfig[field], bounds.min, bounds.max);
      if (sanitized === undefined) {
        delete nextConfig[field];
      } else {
        nextConfig[field] = sanitized;
      }
    }
    nextModules[configKey] = nextConfig;
  }

  return nextModules;
}

function buildModuleConfig(modules: Record<string, unknown> | undefined): Record<string, boolean> | undefined {
  if (!modules) return undefined;

  const moduleConfig = Object.fromEntries(
    MODULE_CONFIG_KEYS.flatMap((key: string) => (
      key in modules ? [[key, modules[key] === true]] : []
    )),
  );

  return Object.keys(moduleConfig).length > 0 ? moduleConfig : undefined;
}

function buildSelectedSkills(skills: Record<string, unknown> | undefined): string[] | undefined {
  if (!skills || !Array.isArray(skills.selectedSkills)) return undefined;
  return skills.selectedSkills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0);
}

function normalizeWizardProvider(provider: unknown): string | undefined {
  if (typeof provider !== 'string') return undefined;
  const trimmed = provider.trim();
  if (trimmed.length === 0) return undefined;
  return CLI_PROVIDER_BY_WIZARD_PROVIDER[trimmed] ?? trimmed;
}

const LLM_OPERATION_ALIASES_BY_WIZARD_ACTION: Record<string, readonly string[]> = {
  planning: ['plan-build', 'issue-triage', 'issue-graph'],
  execution: ['issues', 'cli-session'],
  critique: ['critique'],
  reflection: ['chunk-session-compaction'],
  chat: ['chat'],
};

function llmOperationAliasesForWizardAction(action: string): readonly string[] {
  return LLM_OPERATION_ALIASES_BY_WIZARD_ACTION[action] ?? [action];
}

function buildLlmConfig(llm: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!llm) return undefined;

  const llmConfig: Record<string, unknown> = {};
  const defaultConfig: Record<string, string> = {};
  const defaultProvider = normalizeWizardProvider(llm.defaultProvider);
  if (defaultProvider) {
    defaultConfig.provider = defaultProvider;
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
        const overrideProvider = normalizeWizardProvider(override.provider);
        if (overrideProvider) {
          actionConfig.provider = overrideProvider;
        }
        if (typeof override.model === 'string' && override.model.trim().length > 0) {
          actionConfig.model = override.model;
        }
        return Object.keys(actionConfig).length > 0
          ? llmOperationAliasesForWizardAction(action).map((operation) => [operation, actionConfig])
          : [];
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

  const presetDefaults = typeof git.preset === 'string' ? GIT_PRESET_DEFAULTS[git.preset] : undefined;
  const effectiveGit = { ...(presetDefaults ?? {}), ...git };
  const gitConfig: Record<string, unknown> = {};
  for (const key of ['preset', 'baseBranch', 'mergeStrategy', 'commitConvention'] as const) {
    if (typeof effectiveGit[key] === 'string' && effectiveGit[key].trim().length > 0) {
      gitConfig[key] = effectiveGit[key];
    }
  }
  if (typeof effectiveGit.branchPattern === 'string') {
    gitConfig.branchPattern = normalizeBranchPattern(effectiveGit.branchPattern.trim());
  }
  if (typeof effectiveGit.prCreation === 'boolean') {
    gitConfig.prCreation = effectiveGit.prCreation ? 'auto' : 'disabled';
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
  config.modules = sanitizeModuleConfig(config.modules as Record<string, unknown> | undefined);
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
    const executionTarget = llmProviderModel(llmConfig, 'cli-session');
    if (executionTarget.provider) {
      config.provider = executionTarget.provider;
    }
    if (executionTarget.model) {
      config.model = executionTarget.model;
    }
    if (typeof workflow.objective === 'string') {
      config.objective = workflow.objective;
    }
    const chunkDirectory = typeof workflow.chunkDirectory === 'string' ? workflow.chunkDirectory : workflow.chunkDir;
    if (typeof chunkDirectory === 'string') {
      config.chunkDirectory = chunkDirectory;
    }
  }

  if (typeof config.provider !== 'string') {
    const defaultTarget = llmProviderModel(llmConfig);
    if (defaultTarget.provider) {
      config.provider = defaultTarget.provider;
    }
    if (defaultTarget.model && typeof config.model !== 'string') {
      config.model = defaultTarget.model;
    }
  }

  return config;
}
