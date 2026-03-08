import type { IMemoryModule, MemoryContext, EpisodicEntry } from '../deps.js';

export interface MemoryPortAdapterConfig {
  context?: MemoryContext | undefined;
}

export class MemoryPortAdapter implements IMemoryModule {
  private readonly traces: EpisodicEntry[] = [];
  private readonly context: MemoryContext;

  constructor(config: MemoryPortAdapterConfig = {}) {
    this.context = config.context ?? { adrs: [], knownErrors: [], rules: [] };
  }

  async frontload(_projectId: string): Promise<void> {
    return;
  }

  async getContext(_projectId: string): Promise<MemoryContext> {
    return this.context;
  }

  async recordTrace(trace: EpisodicEntry): Promise<void> {
    this.traces.push(trace);
  }
}
