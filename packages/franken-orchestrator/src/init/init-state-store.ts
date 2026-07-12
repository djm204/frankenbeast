import type { InitState } from './init-types.js';
import { createEmptyInitState } from './init-types.js';
import { readJsonFileOrDefault, warnJsonQuarantined, writeJsonFileAtomic } from './init-json-file.js';
import { resolve } from 'node:path';

function normalizeConfigPathForComparison(configPath: string): string {
  return resolve(configPath);
}

export function isInitStateForConfig(value: unknown, configPath: string): value is InitState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const state = value as Partial<InitState>;
  if (typeof state.configPath !== 'string') {
    return false;
  }
  return state.version === 1
    && normalizeConfigPathForComparison(state.configPath) === normalizeConfigPathForComparison(configPath)
    && Array.isArray(state.selectedModules)
    && Array.isArray(state.selectedCommsTransports)
    && Array.isArray(state.completedSteps)
    && (state.securityMode === 'secure' || state.securityMode === 'insecure')
    && state.verification !== null
    && typeof state.verification === 'object'
    && !Array.isArray(state.verification)
    && state.answers !== null
    && typeof state.answers === 'object'
    && !Array.isArray(state.answers);
}

export class FileInitStateStore {
  constructor(readonly filePath: string) {}

  async load(configPath: string, fallback: () => InitState = () => createEmptyInitState(configPath)): Promise<InitState> {
    const state = await readJsonFileOrDefault<unknown>(this.filePath, fallback, {
      description: 'init state',
      onCorrupt: warnJsonQuarantined,
    });
    return isInitStateForConfig(state, configPath) ? state : fallback();
  }

  async save(state: InitState): Promise<InitState> {
    await writeJsonFileAtomic(this.filePath, state);
    return state;
  }
}
