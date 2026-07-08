#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { parseArgs } from 'node:util';

export interface ObserverServerDeps {
  observer: ObserverAdapter;
}

export function createObserverServer(deps: ObserverServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('observer', deps);
  return createMcpServer('fbeast-observer', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const observer = createObserverAdapter(values['db']!);
  const server = createObserverServer({ observer }, createCentralOptions(values['db']!));
  server.start().catch((err) => {
    console.error('fbeast-observer failed to start:', err);
    process.exit(1);
  });
}
