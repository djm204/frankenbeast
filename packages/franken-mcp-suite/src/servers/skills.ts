#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { parseArgs } from 'node:util';

export function createSkillsServer(store: SqliteStore): FbeastMcpServer {
  const { db } = store;

  const tools: ToolDef[] = [
    {
      name: 'fbeast_skills_list',
      description: 'List all registered skills. Optionally filter by enabled status.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'string', description: 'Filter: "true" for enabled only, "false" for disabled only' },
        },
      },
      async handler(args) {
        let sql = `SELECT name, enabled, config, updated_at FROM skill_state`;
        const params: unknown[] = [];

        if (args['enabled'] !== undefined) {
          sql += ` WHERE enabled = ?`;
          params.push(String(args['enabled']) === 'true' ? 1 : 0);
        }
        sql += ` ORDER BY name`;

        const rows = db.prepare(sql).all(...params) as Array<{
          name: string; enabled: number; config: string; updated_at: string;
        }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'No skills registered.' }] };
        }

        const lines = rows.map((r) => {
          const status = r.enabled ? 'enabled' : 'disabled';
          return `- **${r.name}** [${status}] (updated: ${r.updated_at})`;
        });

        return { content: [{ type: 'text', text: `## Skills (${rows.length})\n\n${lines.join('\n')}` }] };
      },
    },
    {
      name: 'fbeast_skills_discover',
      description: 'Search for skills by name or description keyword.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword (matches name and config description)' },
        },
      },
      async handler(args) {
        const query = args['query'] ? String(args['query']) : '';

        let sql = `SELECT name, enabled, config FROM skill_state`;
        const params: unknown[] = [];

        if (query) {
          sql += ` WHERE name LIKE ? OR config LIKE ?`;
          params.push(`%${query}%`, `%${query}%`);
        }
        sql += ` ORDER BY name`;

        const rows = db.prepare(sql).all(...params) as Array<{
          name: string; enabled: number; config: string;
        }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: query ? `No skills matching "${query}".` : 'No skills registered.' }] };
        }

        const lines = rows.map((r) => {
          const cfg = JSON.parse(r.config || '{}');
          const desc = cfg.description || 'No description';
          return `- **${r.name}**: ${desc}`;
        });

        return { content: [{ type: 'text', text: `## Discovered Skills (${rows.length})\n\n${lines.join('\n')}` }] };
      },
    },
    {
      name: 'fbeast_skills_info',
      description: 'Get detailed information about a specific skill.',
      inputSchema: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: 'Skill name/ID' },
        },
        required: ['skillId'],
      },
      async handler(args) {
        const skillId = String(args['skillId']);

        const row = db.prepare(
          `SELECT name, enabled, config, updated_at FROM skill_state WHERE name = ?`,
        ).get(skillId) as { name: string; enabled: number; config: string; updated_at: string } | undefined;

        if (!row) {
          return { content: [{ type: 'text', text: `Skill not found: ${skillId}` }], isError: true };
        }

        const cfg = JSON.parse(row.config || '{}');
        const lines = [
          `## Skill: ${row.name}`,
          '',
          `**Status:** ${row.enabled ? 'enabled' : 'disabled'}`,
          `**Updated:** ${row.updated_at}`,
          '',
          '**Config:**',
          '```json',
          JSON.stringify(cfg, null, 2),
          '```',
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },
  ];

  return createMcpServer('fbeast-skills', '0.1.0', tools);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const store = createSqliteStore(values['db']!);
  const server = createSkillsServer(store);
  server.start().catch((err) => {
    console.error('fbeast-skills failed to start:', err);
    process.exit(1);
  });
}
