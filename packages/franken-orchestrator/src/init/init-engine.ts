import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InterviewIO } from '../planning/interview-loop.js';
import { OrchestratorConfigSchema, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { FileInitStateStore } from './init-state-store.js';
import { runInitWizard } from './init-wizard.js';
import type { InitState } from './init-types.js';
import { verifyInit } from './init-verify.js';
import type { ISecretStore } from '../network/secret-store.js';

export interface InitEngineResult {
  config: OrchestratorConfig;
  state: InitState;
}

interface RunInteractiveInitOptions {
  configFile: string;
  stateStore: FileInitStateStore;
  io: InterviewIO;
  secretStore?: ISecretStore | undefined;
}

type RunRepairInitOptions = RunInteractiveInitOptions;

async function loadExistingConfig(configFile: string): Promise<OrchestratorConfig> {
  try {
    const raw = await readFile(configFile, 'utf-8');
    return OrchestratorConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultConfig();
    }
    throw error;
  }
}

async function saveConfig(configFile: string, config: OrchestratorConfig): Promise<void> {
  await mkdir(dirname(configFile), { recursive: true });
  await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function runInteractiveInit(options: RunInteractiveInitOptions): Promise<InitEngineResult> {
  const initialState = await options.stateStore.load(options.configFile);
  const baseConfig = await loadExistingConfig(options.configFile);
  const result = await runInitWizard({
    io: options.io,
    initialState,
    baseConfig,
    secretStore: options.secretStore,
  });

  await saveConfig(options.configFile, result.config);
  const state = await options.stateStore.save(result.state);

  return {
    config: result.config,
    state,
  };
}

export async function runRepairInit(options: RunRepairInitOptions): Promise<InitEngineResult> {
  const verification = await verifyInit({
    configFile: options.configFile,
    stateStore: options.stateStore,
  });

  if (verification.ok) {
    const state = await options.stateStore.load(options.configFile);
    return {
      config: verification.config ?? defaultConfig(),
      state,
    };
  }

  const needsFullWizard = verification.issues.some((issue) =>
    issue.code === 'missing-config' || issue.code === 'missing-init-state');
  if (needsFullWizard) {
    return runInteractiveInit(options);
  }

  const initialState = await options.stateStore.load(options.configFile);
  const baseConfig = await loadExistingConfig(options.configFile);
  const scope = verification.issues.flatMap((issue) => {
    switch (issue.code) {
      case 'slack-incomplete':
        return ['slack'] as const;
      case 'discord-incomplete':
        return ['discord'] as const;
      default:
        return [] as const;
    }
  });
  const result = await runInitWizard({
    io: options.io,
    initialState,
    baseConfig,
    scope,
    secretStore: options.secretStore,
  });

  await saveConfig(options.configFile, result.config);
  const state = await options.stateStore.save(result.state);

  return {
    config: result.config,
    state,
  };
}
