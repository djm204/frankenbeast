import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ManagedNetworkServiceState {
  id: string;
  pid: number;
  detached?: boolean | undefined;
  dependsOn: string[];
  startedAt: string;
  status?: 'started' | 'already-running';
  logFile?: string | undefined;
  url?: string | undefined;
  healthUrl?: string | undefined;
  serviceIdentity?: string | undefined;
}

export interface NetworkOperatorState {
  mode: 'secure' | 'insecure';
  secureBackend: string;
  detached: boolean;
  startedAt: string;
  services: ManagedNetworkServiceState[];
}

export class NetworkStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<NetworkOperatorState | undefined> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as NetworkOperatorState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async save(state: NetworkOperatorState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
