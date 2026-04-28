#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { createBrainAdapter, type BrainAdapter } from '../adapters/brain-adapter.js';
import { parseArgs } from 'node:util';

export interface MemoryServerDeps {
  brain: BrainAdapter;
}

export function createMemoryServer(deps: MemoryServerDeps): FbeastMcpServer {
  const { brain } = deps;

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
        const rows = await brain.query(type ? { query, type, limit } : { query, limit });

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `No memory entries found for query: "${query}"` }] };
        }

        const text = rows
          .map((row) => formatMemoryEntry(row))
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
        await brain.store({ key, value, type });
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
      async handler(args) {
        const projectId = String(args['projectId']);
        const sections = await brain.frontload(projectId);

        if (sections.length === 0) {
          return { content: [{ type: 'text', text: 'No memory entries stored yet.' }] };
        }

        const text = sections
          .map((section) => `## ${section.type}\n${section.entries.map((entry) => `  ${entry}`).join('\n')}`)
          .join('\n\n');

        return { content: [{ type: 'text', text }] };
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
        const removed = await brain.forget(key);
        if (!removed) {
          return { content: [{ type: 'text', text: `No memory entry found with key: ${key}` }] };
        }
        return { content: [{ type: 'text', text: `Removed memory: ${key}` }] };
      },
    },
  ];

  return createMcpServer('fbeast-memory', '0.1.0', tools);
}

// CLI entry point
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const brain = createBrainAdapter(values['db']!);
  const server = createMemoryServer({ brain });
  server.start().catch((err) => {
    console.error('fbeast-memory failed to start:', err);
    process.exit(1);
  });
}

function formatMemoryEntry(row: { key: string; value: string; type: string; createdAt?: string }): string {
  if (row.createdAt) {
    return `[${row.type}] ${row.key}: ${row.value} (${row.createdAt})`;
  }
  return `[${row.type}] ${row.key}: ${row.value}`;
}
