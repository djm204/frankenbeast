import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { IMemoryModule, MemoryContext, EpisodicEntry } from '../deps.js';

export interface EpisodicStorePort {
  record(trace: {
    id: string;
    type: 'episodic';
    projectId: string;
    taskId: string;
    status: string;
    createdAt: number;
    input: unknown;
    output: unknown;
  }): string | Promise<string>;
  queryFailed(projectId: string): Array<{
    id: string;
    type: 'episodic';
    projectId: string;
    taskId: string;
    status: string;
    createdAt: number;
    input: unknown;
    output: unknown;
  }>;
}

export interface EpisodicMemoryPortAdapterDeps {
  episodicStore: EpisodicStorePort;
  projectId: string;
  projectRoot: string;
  idFactory?: () => string;
}

export class EpisodicMemoryPortAdapter implements IMemoryModule {
  private cachedAdrs: string[] = [];
  private readonly deps: EpisodicMemoryPortAdapterDeps;

  constructor(deps: EpisodicMemoryPortAdapterDeps) {
    this.deps = deps;
  }

  async frontload(_projectId: string): Promise<void> {
    this.cachedAdrs = this.scanAdrs();
  }

  async getContext(_projectId: string): Promise<MemoryContext> {
    const failedTraces = this.deps.episodicStore.queryFailed(this.deps.projectId);
    const knownErrors = failedTraces.map(t =>
      typeof t.input === 'string' ? t.input : JSON.stringify(t.input),
    );

    return {
      adrs: this.cachedAdrs,
      knownErrors,
      rules: [],
    };
  }

  async recordTrace(trace: EpisodicEntry): Promise<void> {
    const id = this.deps.idFactory?.() ?? randomUUID();
    const createdAt = Date.parse(trace.timestamp);
    this.deps.episodicStore.record({
      id,
      type: 'episodic',
      projectId: this.deps.projectId,
      status: trace.outcome,
      createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
      taskId: trace.taskId,
      input: trace.summary,
      output: null,
    });
  }

  private scanAdrs(): string[] {
    const adrDir = resolve(this.deps.projectRoot, 'docs', 'adr');
    try {
      return readdirSync(adrDir)
        .filter(f => f.endsWith('.md'))
        .sort();
    } catch {
      return [];
    }
  }
}
