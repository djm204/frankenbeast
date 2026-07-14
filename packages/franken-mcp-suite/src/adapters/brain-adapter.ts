import { SqliteBrain, type RightToForgetReport, type RightToForgetSelector } from '@franken/brain';
import Database from 'better-sqlite3';
import { isoNow } from '@franken/types';

function configureBrainAdapterDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
}

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
  frontload(): Promise<BrainFrontloadSection[]>;
  forget(key: string): Promise<boolean>;
  rightToForget(input: RightToForgetSelector): Promise<RightToForgetReport>;
}

const SUPPORTED_MEMORY_TYPES = ['working', 'episodic'] as const;
const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 1000;

type SupportedMemoryType = (typeof SUPPORTED_MEMORY_TYPES)[number];

function resolveQueryLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_QUERY_LIMIT;
  if (!Number.isFinite(limit) || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
    throw new Error(`limit must be a positive integer between 1 and ${MAX_QUERY_LIMIT}`);
  }
  return limit;
}

export function createBrainAdapter(dbPath: string): BrainAdapter {
  const brain = new SqliteBrain(dbPath);

  const resolveMemoryType = (type: string | undefined): SupportedMemoryType | undefined => {
    if (type === undefined) return undefined;
    if (SUPPORTED_MEMORY_TYPES.includes(type as SupportedMemoryType)) {
      return type as SupportedMemoryType;
    }
    throw new Error(`Unsupported memory type: ${type}. Supported types: ${SUPPORTED_MEMORY_TYPES.join(', ')}`);
  };

  // Rehydrate working memory from SQLite so entries survive process restarts.
  // SqliteBrain's constructor starts with an empty in-memory Map; flush() writes
  // to the working_memory table but construction doesn't read it back.
  const readDb = new Database(dbPath);
  configureBrainAdapterDb(readDb);
  try {
    const rows = readDb.prepare('SELECT key, value FROM working_memory').all() as Array<{ key: string; value: string }>;
    const snap: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        snap[row.key] = JSON.parse(row.value);
      } catch {
        snap[row.key] = row.value;
      }
    }
    if (Object.keys(snap).length > 0) {
      brain.working.restore(snap);
    }
  } catch {
    // Table may not exist yet on first run — that's fine
  } finally {
    readDb.close();
  }

  return {
    async query(input) {
      const memoryType = resolveMemoryType(input.type);
      const limit = resolveQueryLimit(input.limit);
      const results: BrainMemoryEntry[] = [];

      // Search episodic memory
      if (!memoryType || memoryType === 'episodic') {
        const events = brain.episodic.recall(input.query, limit);
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
      if (!memoryType || memoryType === 'working') {
        const snapshot = brain.working.snapshot();
        const query = input.query.toLowerCase();
        for (const [key, value] of Object.entries(snapshot)) {
          const strValue = typeof value === 'string' ? value : JSON.stringify(value);
          if (key.toLowerCase().includes(query) || strValue.toLowerCase().includes(query)) {
            results.push({ key, value: strValue, type: 'working' });
          }
        }
      }

      return results.slice(0, limit);
    },

    async store(input) {
      const memoryType = resolveMemoryType(input.type);

      if (memoryType === 'episodic') {
        brain.episodic.record({
          type: 'success',
          summary: `${input.key}: ${input.value}`,
          createdAt: isoNow(),
        });
        return;
      }

      brain.working.set(input.key, input.value);
      brain.flush();
    },

    async frontload() {
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

    async rightToForget(input) {
      return brain.rightToForget(input);
    },
  };
}
