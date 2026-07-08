#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createPlannerAdapter, type PlannerAdapter } from '../adapters/planner-adapter.js';
import { parseArgs } from 'node:util';

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
  const planner = createPlannerAdapter(values['db']!);
  const server = createPlannerServer({ planner }, createCentralOptions(values['db']!));
  server.start().catch((err) => {
    console.error('fbeast-planner failed to start:', err);
    process.exit(1);
  });
}
