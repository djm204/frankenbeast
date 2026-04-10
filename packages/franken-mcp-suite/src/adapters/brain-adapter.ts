import { SqliteBrain } from 'franken-brain';
import { createSqliteStore } from '../shared/sqlite-store.js';

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
  const store = createSqliteStore(dbPath);
  const brain = new SqliteBrain(dbPath);

  hydrateWorkingMemoryFromLegacyTable();

  return {
    async query(input) {
      let sql = 'SELECT key, value, type, created_at AS createdAt FROM memory WHERE (key LIKE ? OR value LIKE ?)';
      const params: unknown[] = [`%${input.query}%`, `%${input.query}%`];

      if (input.type) {
        sql += ' AND type = ?';
        params.push(input.type);
      }

      sql += ' ORDER BY updated_at DESC LIMIT ?';
      params.push(input.limit ?? 20);

      return store.db.prepare(sql).all(...params) as BrainMemoryEntry[];
    },

    async store(input) {
      store.db.prepare(`
        INSERT INTO memory (key, value, type)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          type = excluded.type,
          updated_at = datetime('now')
      `).run(input.key, input.value, input.type);

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
      const rows = store.db.prepare(
        'SELECT key, value, type FROM memory ORDER BY type, key',
      ).all() as Array<{ key: string; value: string; type: string }>;

      const grouped = new Map<string, string[]>();
      for (const row of rows) {
        const entries = grouped.get(row.type) ?? [];
        entries.push(`${row.key}: ${row.value}`);
        grouped.set(row.type, entries);
      }

      return [...grouped.entries()].map(([type, entries]) => ({ type, entries }));
    },

    async forget(key) {
      const result = store.db.prepare('DELETE FROM memory WHERE key = ?').run(key);
      brain.working.delete(key);
      brain.flush();
      return result.changes > 0;
    },
  };

  function hydrateWorkingMemoryFromLegacyTable(): void {
    const rows = store.db.prepare(
      "SELECT key, value FROM memory WHERE type != 'episodic' ORDER BY key",
    ).all() as Array<{ key: string; value: string }>;

    for (const row of rows) {
      brain.working.set(row.key, row.value);
    }
    brain.flush();
  }
}
