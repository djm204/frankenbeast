import type {
  IMemoryModule,
  MemoryContext,
  EpisodicEntry,
} from '../deps.js';
import type { SqliteBrain } from 'franken-brain';

/**
 * Adapts SqliteBrain (Phase 2) to the IMemoryModule port.
 * Translates between the old memory interface and the new brain API.
 */
export class SqliteBrainMemoryAdapter implements IMemoryModule {
  constructor(private readonly brain: SqliteBrain) {}

  async frontload(_projectId: string): Promise<void> {
    // SqliteBrain loads from its SQLite file on construction.
    // No separate frontload step needed — data is already available.
  }

  async getContext(_projectId: string): Promise<MemoryContext> {
    // Build context from brain's working memory and episodic records
    const adrs = (this.brain.working.get('adrs') as string[]) ?? [];
    const knownErrors = this.brain.episodic
      .recentFailures(10)
      .map((e) => e.summary);
    const rules = (this.brain.working.get('rules') as string[]) ?? [];

    return { adrs, knownErrors, rules };
  }

  async recordTrace(trace: EpisodicEntry): Promise<void> {
    this.brain.episodic.record({
      type: trace.outcome === 'success' ? 'success' : 'failure',
      summary: `[${trace.taskId}] ${trace.summary}`,
      createdAt: trace.timestamp,
    });
  }
}
