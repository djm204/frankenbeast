#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createSkillsAdapter, type SkillsAdapter } from '../adapters/skills-adapter.js';
import { parseArgs } from 'node:util';

export interface SkillsServerDeps {
  skills: SkillsAdapter;
}

export function createSkillsServer(deps: SkillsServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('skills', deps);
  return createMcpServer('fbeast-skills', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const skills = createSkillsAdapter(values['db']!);
  const server = createSkillsServer({ skills }, createCentralOptions(values['db']!));
  server.start().catch((err) => {
    console.error('fbeast-skills failed to start:', err);
    process.exit(1);
  });
}
