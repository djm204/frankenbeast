#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { parseArgs } from 'node:util';

export function createMemoryServer(store: SqliteStore): FbeastMcpServer {
  const { db } = store;

  const tools: ToolDef[] = [
    {
      name: 'fbeast_memory_query',
      description: 'Query memory for stored entries. Searches keys and values by substring match.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (substring match on key and value)' },
          type: { type: 'string', description: 'Filter by type: working, episodic, recovery' },
          limit: { type: 'string', description: 'Max results (default 20)' },
        },
        required: ['query'],
      },
      async handler(args) {
        const query = String(args['query']);
        const type = args['type'] ? String(args['type']) : undefined;
        const limit = args['limit'] ? Number(args['limit']) : 20;

        let sql = `SELECT key, value, type, created_at FROM memory WHERE (key LIKE ? OR value LIKE ?)`;
        const params: unknown[] = [`%${query}%`, `%${query}%`];

        if (type) {
          sql += ` AND type = ?`;
          params.push(type);
        }
        sql += ` ORDER BY updated_at DESC LIMIT ?`;
        params.push(limit);

        const rows = db.prepare(sql).all(...params) as Array<{
          key: string; value: string; type: string; created_at: string;
        }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `No memory entries found for query: "${query}"` }] };
        }

        const text = rows
          .map((r) => `[${r.type}] ${r.key}: ${r.value} (${r.created_at})`)
          .join('\n');
        return { content: [{ type: 'text', text }] };
      },
    },
    {
      name: 'fbeast_memory_store',
      description: 'Store a memory entry. Upserts by key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique key for this memory entry' },
          value: { type: 'string', description: 'Content to store' },
          type: { type: 'string', description: 'Memory type: working, episodic, or recovery' },
        },
        required: ['key', 'value', 'type'],
      },
      async handler(args) {
        const key = String(args['key']);
        const value = String(args['value']);
        const type = String(args['type']);

        db.prepare(`
          INSERT INTO memory (key, value, type)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type, updated_at = datetime('now')
        `).run(key, value, type);

        return { content: [{ type: 'text', text: `Stored memory: ${key}` }] };
      },
    },
    {
      name: 'fbeast_memory_frontload',
      description: 'Load all memory entries for project context. Returns everything stored.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Project identifier (for future multi-project support)' },
        },
        required: ['projectId'],
      },
      async handler(_args) {
        const rows = db.prepare(
          `SELECT key, value, type FROM memory ORDER BY type, key`,
        ).all() as Array<{ key: string; value: string; type: string }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'No memory entries stored yet.' }] };
        }

        const grouped = new Map<string, string[]>();
        for (const r of rows) {
          const list = grouped.get(r.type) ?? [];
          list.push(`  ${r.key}: ${r.value}`);
          grouped.set(r.type, list);
        }

        const sections = [...grouped.entries()]
          .map(([type, entries]) => `## ${type}\n${entries.join('\n')}`)
          .join('\n\n');

        return { content: [{ type: 'text', text: sections }] };
      },
    },
    {
      name: 'fbeast_memory_forget',
      description: 'Remove a memory entry by key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key of the memory entry to remove' },
        },
        required: ['key'],
      },
      async handler(args) {
        const key = String(args['key']);
        const result = db.prepare(`DELETE FROM memory WHERE key = ?`).run(key);
        if (result.changes === 0) {
          return { content: [{ type: 'text', text: `No memory entry found with key: ${key}` }] };
        }
        return { content: [{ type: 'text', text: `Removed memory: ${key}` }] };
      },
    },
  ];

  return createMcpServer('fbeast-memory', '0.1.0', tools);
}

// CLI entry point
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const store = createSqliteStore(values['db']!);
  const server = createMemoryServer(store);
  server.start().catch((err) => {
    console.error('fbeast-memory failed to start:', err);
    process.exit(1);
  });
}
