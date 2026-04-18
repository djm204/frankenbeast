import { SqliteBrain } from 'franken-brain';

export interface BrainQueryInput {
  query: string;
  type?: string;
  limit?: number;
}

export interface BrainMemoryEntry {
  key: string;
  value: string;
  type: string;
  createdAt?: string;
}

export interface BrainFrontloadSection {
  type: string;
  entries: string[];
}

export interface BrainAdapter {
  query(input: BrainQueryInput): Promise<BrainMemoryEntry[]>;
  store(input: { key: string; value: string; type: string }): Promise<void>;
  frontload(projectId: string): Promise<BrainFrontloadSection[]>;
  forget(key: string): Promise<boolean>;
}

export function createBrainAdapter(dbPath: string): BrainAdapter {
  const brain = new SqliteBrain(dbPath);

  return {
    async query(input) {
      const results: BrainMemoryEntry[] = [];

      // Search episodic memory
      if (!input.type || input.type === 'episodic') {
        const events = brain.episodic.recall(input.query, input.limit ?? 20);
        for (const event of events) {
          results.push({
            key: String(event.id ?? event.summary),
            value: event.summary,
            type: 'episodic',
            createdAt: event.createdAt,
          });
        }
      }

      // Search working memory
      if (!input.type || input.type !== 'episodic') {
        const snapshot = brain.working.snapshot();
        const query = input.query.toLowerCase();
        for (const [key, value] of Object.entries(snapshot)) {
          const strValue = typeof value === 'string' ? value : JSON.stringify(value);
          if (key.toLowerCase().includes(query) || strValue.toLowerCase().includes(query)) {
            results.push({ key, value: strValue, type: 'working' });
          }
        }
      }

      return results.slice(0, input.limit ?? 20);
    },

    async store(input) {
      if (input.type === 'episodic') {
        brain.episodic.record({
          type: 'success',
          summary: `${input.key}: ${input.value}`,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      brain.working.set(input.key, input.value);
      brain.flush();
    },

    async frontload(_projectId) {
      const sections: BrainFrontloadSection[] = [];

      // Working memory
      const snapshot = brain.working.snapshot();
      const workingEntries = Object.entries(snapshot).map(
        ([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
      );
      if (workingEntries.length > 0) {
        sections.push({ type: 'working', entries: workingEntries });
      }

      // Recent episodic events
      const events = brain.episodic.recent(100);
      const episodicEntries = events.map((e) => `${e.id ?? '-'}: ${e.summary}`);
      if (episodicEntries.length > 0) {
        sections.push({ type: 'episodic', entries: episodicEntries });
      }

      return sections;
    },

    async forget(key) {
      if (brain.working.has(key)) {
        brain.working.delete(key);
        brain.flush();
        return true;
      }
      return false;
    },
  };
}
