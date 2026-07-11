import type { InitState } from './init-types.js';
import { createEmptyInitState } from './init-types.js';
import { readJsonFileOrDefault, warnJsonQuarantined, writeJsonFileAtomic } from './init-json-file.js';

export class FileInitStateStore {
  constructor(readonly filePath: string) {}

  async load(configPath: string, fallback: () => InitState = () => createEmptyInitState(configPath)): Promise<InitState> {
    return readJsonFileOrDefault(this.filePath, fallback, {
      description: 'init state',
      onCorrupt: warnJsonQuarantined,
    });
  }

  async save(state: InitState): Promise<InitState> {
    await writeJsonFileAtomic(this.filePath, state);
    return state;
  }
}
