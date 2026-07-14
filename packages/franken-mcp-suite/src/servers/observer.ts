#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { handleStartupFailure } from '../shared/shutdown.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { parseArgs } from 'node:util';
import { resolveProjectDbPath } from '../shared/resolve-db-path.js';

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
  const dbPath = resolveProjectDbPath(values['db']!);
  const observer = createObserverAdapter(dbPath);
  const server = createObserverServer({ observer }, createCentralOptions(dbPath));
  server.start().catch((err) => {
    handleStartupFailure('fbeast-observer', err);
  });
}
