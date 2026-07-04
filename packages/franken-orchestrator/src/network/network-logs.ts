import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NetworkOperatorState } from './network-state-store.js';

export class NetworkLogStore {
  constructor(private readonly logDir: string) {}

  async register(serviceId: string): Promise<string> {
    await mkdir(this.logDir, { recursive: true });
    return join(this.logDir, `${serviceId}.log`);
  }

  async resolve(state: NetworkOperatorState, target: string | 'all'): Promise<string[]> {
    const services = target === 'all'
      ? state.services
      : state.services.filter((service) => service.id === target);

    const logFiles = services
      .map((service) => service.logFile)
      .filter((logFile): logFile is string => Boolean(logFile));

    const logs = await Promise.all(logFiles.map(async (logFile) => {
      try {
        return await readFile(logFile, 'utf-8');
      } catch {
        return '';
      }
    }));

    return logs.flatMap((log) => log.split(/\r?\n/).filter((line) => line.length > 0));
  }
}
