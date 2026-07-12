import type { BeastCatalogEntry, BeastContainerRuntimeStatus, BeastExecutionMode } from '../../lib/beast-api';
import { normalizePath, type ServerEnvironment } from '../../lib/path-utils';
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

const REPO_RELATIVE_PATH_ENV: ServerEnvironment = {
  os: 'linux',
  platform: 'linux',
  isWsl: false,
  pathSeparator: '/',
};

const PATH_CONFIG_KEYS = new Set(['outputPath', 'designDocPath', 'outputDir', 'chunkDirectory']);

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

function normalizeRepoRelativeLaunchPath(fieldName: string, value: string): string {
  if (value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) {
    throw new Error(`${fieldName} must be a repo-relative path without traversal.`);
  }

  const normalized = normalizePath(value, REPO_RELATIVE_PATH_ENV);
  if (!normalized.valid) {
    throw new Error(`${fieldName}: ${normalized.error ?? 'Invalid path'}`);
  }

  return normalized.normalized;
}

function isCatalogPathPrompt(prompt: { key: string; kind?: string }): boolean {
  const key = prompt.key.toLowerCase();
  return (
    PATH_CONFIG_KEYS.has(prompt.key) ||
    prompt.kind === 'file' ||
    prompt.kind === 'directory' ||
    key.includes('path') ||
    key.includes('dir') ||
    key.includes('directory')
  );
}

function setNormalizedLaunchPath(
  config: Record<string, unknown>,
  workflow: Record<string, unknown> | undefined,
  configKey: string,
  workflowKeys: string[],
  value: string,
): void {
  const normalized = normalizeRepoRelativeLaunchPath(configKey, value);
  config[configKey] = normalized;
  if (workflow) {
    for (const workflowKey of workflowKeys) {
      if (typeof workflow[workflowKey] === 'string') {
        workflow[workflowKey] = normalized;
      }
    }
  }
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

  if (config.workflow && typeof config.workflow === 'object' && !Array.isArray(config.workflow)) {
    config.workflow = { ...(config.workflow as Record<string, unknown>) };
  }
  const workflow = config.workflow as Record<string, unknown> | undefined;
  config.modules = sanitizeModuleConfig(config.modules as Record<string, unknown> | undefined);
  const selectedWorkflow = typeof workflow?.workflowType === 'string'
    ? findCatalogEntry(catalog, workflow.workflowType)
    : undefined;
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
        config[prompt.key] = typeof value === 'string' && isCatalogPathPrompt(prompt)
          ? normalizeRepoRelativeLaunchPath(prompt.key, value)
          : value;
      }
    }
  }

  if (workflow?.workflowType === 'design-interview') {
    const goal = typeof workflow.goal === 'string' ? workflow.goal : workflow.topic;
    if (typeof goal === 'string') {
      config.goal = goal;
    }
    if (typeof workflow.outputPath === 'string') {
      setNormalizedLaunchPath(config, workflow, 'outputPath', ['outputPath'], workflow.outputPath);
    }
  }

  if (workflow?.workflowType === 'chunk-plan') {
    const designDocPath = typeof workflow.designDocPath === 'string' ? workflow.designDocPath : workflow.docPath;
    if (typeof designDocPath === 'string') {
      setNormalizedLaunchPath(config, workflow, 'designDocPath', ['designDocPath', 'docPath'], designDocPath);
    }
    if (typeof workflow.outputDir === 'string') {
      setNormalizedLaunchPath(config, workflow, 'outputDir', ['outputDir'], workflow.outputDir);
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
      setNormalizedLaunchPath(config, workflow, 'chunkDirectory', ['chunkDirectory', 'chunkDir'], chunkDirectory);
    }
  }

  return config;
}
