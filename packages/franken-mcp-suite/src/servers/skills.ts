#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSkillsAdapter, type SkillsAdapter } from '../adapters/skills-adapter.js';
import { parseArgs } from 'node:util';

export interface SkillsServerDeps {
  skills: SkillsAdapter;
}

export function createSkillsServer(deps: SkillsServerDeps): FbeastMcpServer {
  const { skills } = deps;

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
        const enabled = args['enabled'] !== undefined ? String(args['enabled']) === 'true' : undefined;
        const rows = await skills.list(enabled === undefined ? {} : { enabled });

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'No skills registered.' }] };
        }

        const lines = rows.map((r) => {
          const status = r.enabled ? 'enabled' : 'disabled';
          return `- **${r.name}** [${status}] (updated: ${r.updatedAt ?? 'unknown'})`;
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
        const rows = await skills.list({});
        const normalizedQuery = query.trim().toLowerCase();
        const matches = normalizedQuery.length === 0
          ? rows
          : rows.filter((row) =>
              row.name.toLowerCase().includes(normalizedQuery)
              || row.description.toLowerCase().includes(normalizedQuery));

        if (matches.length === 0) {
          return { content: [{ type: 'text', text: query ? `No skills matching "${query}".` : 'No skills registered.' }] };
        }

        const lines = matches.map((row) => {
          return `- **${row.name}**: ${row.description}`;
        });

        return { content: [{ type: 'text', text: `## Discovered Skills (${matches.length})\n\n${lines.join('\n')}` }] };
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
        const info = await skills.info(skillId);
        if (!info) {
          return { content: [{ type: 'text', text: `Skill not found: ${skillId}` }], isError: true };
        }

        const lines = [
          `## Skill: ${skillId}`,
          '',
          `**Status:** ${info['enabled'] ? 'enabled' : 'disabled'}`,
          `**Updated:** ${typeof info['updatedAt'] === 'string' ? info['updatedAt'] : 'unknown'}`,
          '',
          '**Config:**',
          '```json',
          JSON.stringify(info, null, 2),
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
  const skills = createSkillsAdapter(values['db']!);
  const server = createSkillsServer({ skills });
  server.start().catch((err) => {
    console.error('fbeast-skills failed to start:', err);
    process.exit(1);
  });
}
