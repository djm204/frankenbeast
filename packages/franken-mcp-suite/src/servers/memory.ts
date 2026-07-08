#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createBrainAdapter, type BrainAdapter } from '../adapters/brain-adapter.js';
import { parseArgs } from 'node:util';

export interface MemoryServerDeps {
  brain: BrainAdapter;
}

export function createMemoryServer(deps: MemoryServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('memory', deps);
  return createMcpServer('fbeast-memory', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const brain = createBrainAdapter(values['db']!);
  const server = createMemoryServer({ brain }, createCentralOptions(values['db']!));
  server.start().catch((err) => {
    console.error('fbeast-memory failed to start:', err);
    process.exit(1);
  });
}
