#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { handleStartupFailure } from '../shared/shutdown.js';
import { createPlannerAdapter, type PlannerAdapter } from '../adapters/planner-adapter.js';
import { parseArgs } from 'node:util';
import { resolveProjectDbPath } from '../shared/resolve-db-path.js';

export interface PlannerServerDeps {
  planner: PlannerAdapter;
}

export function createPlannerServer(deps: PlannerServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('planner', deps);
  return createMcpServer('fbeast-planner', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const dbPath = resolveProjectDbPath(values['db']!);
  const planner = createPlannerAdapter(dbPath);
  const server = createPlannerServer({ planner }, createCentralOptions(dbPath));
  server.start().catch((err) => {
    handleStartupFailure('fbeast-planner', err);
  });
}
