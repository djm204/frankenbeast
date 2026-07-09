#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createCritiqueAdapter, type CritiqueAdapter } from '../adapters/critique-adapter.js';
import { parseArgs } from 'node:util';
import { resolveProjectDbPath } from '../shared/resolve-db-path.js';

export interface CritiqueServerDeps {
  critique: CritiqueAdapter;
}

export function createCritiqueServer(deps: CritiqueServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('critique', deps);
  return createMcpServer('fbeast-critique', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const dbPath = resolveProjectDbPath(values['db']!);
  const critique = createCritiqueAdapter();
  const server = createCritiqueServer({ critique }, createCentralOptions(dbPath));
  server.start().catch((err) => {
    console.error('fbeast-critique failed to start:', err);
    process.exit(1);
  });
}
