import type { InitState } from './init-types.js';
import { createEmptyInitState } from './init-types.js';
import { readJsonFileOrDefault, warnJsonQuarantined, writeJsonFileAtomic } from './init-json-file.js';
import { basename, dirname, resolve } from 'node:path';

function normalizeConfigPathForComparison(configPath: string): string {
  return resolve(configPath);
}

function isDefaultProjectConfigPath(configPath: string): boolean {
  const normalized = normalizeConfigPathForComparison(configPath);
  return basename(normalized) === 'config.json' && basename(dirname(normalized)) === '.fbeast';
}

function isDefaultInitStatePath(stateFilePath: string): boolean {
  const normalized = normalizeConfigPathForComparison(stateFilePath);
  return basename(normalized) === 'init-state.json' && basename(dirname(normalized)) === '.fbeast';
}

function isRelocatedDefaultConfigState(stateConfigPath: string, configPath: string, stateFilePath?: string): boolean {
  return Boolean(stateFilePath)
    && isDefaultInitStatePath(stateFilePath ?? '')
    && isDefaultProjectConfigPath(stateConfigPath)
    && isDefaultProjectConfigPath(configPath)
    && dirname(normalizeConfigPathForComparison(configPath)) === dirname(normalizeConfigPathForComparison(stateFilePath ?? ''));
}

export function isInitStateForConfig(value: unknown, configPath: string, stateFilePath?: string): value is InitState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const state = value as Partial<InitState>;
  if (typeof state.configPath !== 'string') {
    return false;
  }
  const stateConfigMatches = normalizeConfigPathForComparison(state.configPath) === normalizeConfigPathForComparison(configPath)
    || isRelocatedDefaultConfigState(state.configPath, configPath, stateFilePath);
  return state.version === 1
    && stateConfigMatches
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
    return isInitStateForConfig(state, configPath, this.filePath) ? state : fallback();
  }

  async save(state: InitState): Promise<InitState> {
    await writeJsonFileAtomic(this.filePath, state);
    return state;
  }
}
