#!/usr/bin/env node
import { createMcpServer, type ToolDef } from './shared/server-factory.js';
import { createSqliteStore } from './shared/sqlite-store.js';
import { createBrainAdapter } from './adapters/brain-adapter.js';
import { createObserverAdapter } from './adapters/observer-adapter.js';
import { createGovernorAdapter } from './adapters/governor-adapter.js';
import { createMemoryServer } from './servers/memory.js';
import { createObserverServer } from './servers/observer.js';
import { createFirewallServer } from './servers/firewall.js';
import { createCritiqueServer } from './servers/critique.js';
import { createPlannerServer } from './servers/planner.js';
import { createGovernorServer } from './servers/governor.js';
import { createSkillsServer } from './servers/skills.js';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { db: { type: 'string', default: '.fbeast/beast.db' } },
});

const dbPath = values['db']!;
const store = createSqliteStore(dbPath);
const brain = createBrainAdapter(dbPath);
const observer = createObserverAdapter(dbPath);
const governor = createGovernorAdapter(dbPath);

const allTools: ToolDef[] = [
  ...createMemoryServer({ brain }).tools,
  ...createObserverServer({ observer }).tools,
  ...createFirewallServer(store).tools,
  ...createCritiqueServer(store).tools,
  ...createPlannerServer(store).tools,
  ...createGovernorServer({ governor }).tools,
  ...createSkillsServer(store).tools,
];

const server = createMcpServer('fbeast', '0.1.0', allTools);

server.start().catch((err) => {
  console.error('fbeast-mcp failed to start:', err);
  process.exit(1);
});
