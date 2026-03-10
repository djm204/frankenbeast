import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InterviewIO } from '../planning/interview-loop.js';
import { OrchestratorConfigSchema, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { FileInitStateStore } from './init-state-store.js';
import { runInitWizard } from './init-wizard.js';
import type { InitState } from './init-types.js';

export interface InitEngineResult {
  config: OrchestratorConfig;
  state: InitState;
}

interface RunInteractiveInitOptions {
  configFile: string;
  stateStore: FileInitStateStore;
  io: InterviewIO;
}

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
  });

  await saveConfig(options.configFile, result.config);
  const state = await options.stateStore.save(result.state);

  return {
    config: result.config,
    state,
  };
}
