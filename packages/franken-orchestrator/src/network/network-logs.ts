import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { NetworkOperatorState } from './network-state-store.js';

export class NetworkLogStore {
  constructor(private readonly logDir: string) {}

  async register(serviceId: string): Promise<string> {
    await mkdir(this.logDir, { recursive: true });
    return join(this.logDir, `${serviceId}.log`);
  }

  resolve(state: NetworkOperatorState, target: string | 'all'): string[] {
    const services = target === 'all'
      ? state.services
      : state.services.filter((service) => service.id === target);

    return services
      .map((service) => service.logFile)
      .filter((logFile): logFile is string => Boolean(logFile));
  }
}
