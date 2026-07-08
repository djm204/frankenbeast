#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { createFirewallAdapter, type FirewallAdapter } from '../adapters/firewall-adapter.js';
import { parseArgs } from 'node:util';

export interface FirewallServerDeps {
  firewall: FirewallAdapter;
}

export function createFirewallServer(deps: FirewallServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('firewall', deps);
  return createMcpServer('fbeast-firewall', '0.1.0', tools, options);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      db: { type: 'string', default: '.fbeast/beast.db' },
      tier: { type: 'string', default: 'standard' },
    },
  });
  const tier = values['tier'] === 'strict' ? 'strict' : 'standard';
  const firewall = createFirewallAdapter(values['db']!, tier, {
    root: process.env['FBEAST_ROOT'] ?? process.cwd(),
  });
  const server = createFirewallServer({ firewall }, createCentralOptions(values['db']!));
  server.start().catch((err) => {
    console.error('fbeast-firewall failed to start:', err);
    process.exit(1);
  });
}
