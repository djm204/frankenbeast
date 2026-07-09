#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { parseArgs } from 'node:util';
import { resolveProjectDbPath } from '../shared/resolve-db-path.js';

export interface GovernorServerDeps {
  governor: GovernorAdapter;
}

export function createGovernorServer(deps: GovernorServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('governor', deps);
  return createMcpServer('fbeast-governor', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const dbPath = resolveProjectDbPath(values['db']!);
  const governor = createGovernorAdapter(dbPath);
  const server = createGovernorServer({ governor }, createCentralOptions(dbPath));
  server.start().catch((err) => {
    console.error('fbeast-governor failed to start:', err);
    process.exit(1);
  });
}
