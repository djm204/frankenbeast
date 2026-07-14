#!/usr/bin/env node
import { createMcpServer, type CreateMcpServerOptions, type FbeastMcpServer } from '../shared/server-factory.js';
import { createToolDefsForServer } from '../shared/tool-registry.js';
import { createCentralOptions } from '../shared/central-enforcement.js';
import { isMain } from '../shared/is-main.js';
import { handleStartupFailure } from '../shared/shutdown.js';
import { createFirewallAdapter, type FirewallAdapter } from '../adapters/firewall-adapter.js';
import { parseArgs } from 'node:util';
import { deriveProjectRootFromDbPath, resolveProjectDbPath } from '../shared/resolve-db-path.js';
import { isAbsolute, resolve } from 'node:path';

export interface FirewallServerDeps {
  firewall: FirewallAdapter;
}

export function createFirewallServer(deps: FirewallServerDeps, options: CreateMcpServerOptions = {}): FbeastMcpServer {
  const tools = createToolDefsForServer('firewall', deps);
  return createMcpServer('fbeast-firewall', '0.1.0', tools, options);
}

export function resolveFirewallConfigPath(configPath: string | undefined, root: string): string | undefined {
  if (configPath === undefined) return undefined;
  if (configPath === '') throw new Error('Explicit firewall config path must not be empty');
  const expandedConfigPath = expandProjectRootPlaceholder(configPath, root);
  return isAbsolute(expandedConfigPath) ? expandedConfigPath : resolve(root, expandedConfigPath);
}

function expandProjectRootPlaceholder(configPath: string, root: string): string {
  return configPath
    .replace(/^\$\{CLAUDE_PROJECT_DIR}(?=[/\\]|$)/, () => root)
    .replace(/^\$CLAUDE_PROJECT_DIR(?=[/\\]|$)/, () => root)
    .replace(/^\$\{GEMINI_PROJECT_ROOT}(?=[/\\]|$)/, () => root)
    .replace(/^\$GEMINI_PROJECT_ROOT(?=[/\\]|$)/, () => root)
    .replace(/^\$\{FBEAST_ROOT}(?=[/\\]|$)/, () => root)
    .replace(/^\$FBEAST_ROOT(?=[/\\]|$)/, () => root);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      db: { type: 'string', default: '.fbeast/beast.db' },
      tier: { type: 'string', default: 'standard' },
      config: { type: 'string' },
    },
  });
  const tier = values['tier'] === 'strict' ? 'strict' : 'standard';
  const dbPath = resolveProjectDbPath(values['db']!);
  const root = process.env['FBEAST_ROOT'] ?? deriveProjectRootFromDbPath(values['db']!) ?? process.cwd();
  const configPath = resolveFirewallConfigPath(values['config'], root);
  const firewall = createFirewallAdapter(dbPath, tier, { root, configPath });
  const server = createFirewallServer({ firewall }, createCentralOptions(dbPath));
  server.start().catch((err) => {
    handleStartupFailure('fbeast-firewall', err);
  });
}
