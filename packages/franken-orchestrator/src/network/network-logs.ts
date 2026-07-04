import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import type { NetworkOperatorState } from './network-state-store.js';

const MAX_LOG_BYTES = 64 * 1024;

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
      .map((service) => service.logFile ?? state.services.find((candidate) => candidate.id === service.hostServiceId)?.logFile)
      .filter((logFile): logFile is string => Boolean(logFile));

    const logs = await Promise.all([...new Set(logFiles)].map((logFile) => readLogTail(logFile)));

    return logs.flatMap((log) => log.split(/\r?\n/).filter((line) => line.length > 0));
  }
}

async function readLogTail(logFile: string): Promise<string> {
  let file;
  try {
    file = await open(logFile, 'r');
    const { size } = await file.stat();
    const length = Math.min(size, MAX_LOG_BYTES);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    return buffer.toString('utf-8');
  } catch {
    return '';
  } finally {
    await file?.close();
  }
}
