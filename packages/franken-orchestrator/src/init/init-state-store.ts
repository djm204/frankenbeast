import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InitState } from './init-types.js';
import { createEmptyInitState } from './init-types.js';

export class FileInitStateStore {
  constructor(private readonly filePath: string) {}

  async load(configPath: string): Promise<InitState> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as InitState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createEmptyInitState(configPath);
      }
      throw error;
    }
  }

  async save(state: InitState): Promise<InitState> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
    return state;
  }
}
