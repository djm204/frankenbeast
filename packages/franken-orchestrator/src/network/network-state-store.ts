import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicWriteFileSync, readJsonFileOrQuarantine } from '../session/atomic-file.js';

export interface ManagedNetworkServiceState {
  id: string;
  pid: number;
  detached?: boolean | undefined;
  dependsOn: string[];
  startedAt: string;
  status?: 'started' | 'already-running';
  inProcess?: boolean | undefined;
  logFile?: string | undefined;
  url?: string | undefined;
  healthUrl?: string | undefined;
  serviceIdentity?: string | undefined;
  hostServiceId?: string | undefined;
  channels?: Record<string, boolean> | undefined;
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
    return readJsonFileOrQuarantine<NetworkOperatorState>(this.filePath);
  }

  async save(state: NetworkOperatorState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    atomicWriteFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
