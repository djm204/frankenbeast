#!/usr/bin/env node
import { createMcpServer, type ToolDef } from './shared/server-factory.js';
import { createGovernanceGate } from './shared/governance-gate.js';
import { createAuditSink } from './shared/central-enforcement.js';
import { isMain } from './shared/is-main.js';
import { handleStartupFailure } from './shared/shutdown.js';
import { createBrainAdapter } from './adapters/brain-adapter.js';
import { createObserverAdapter } from './adapters/observer-adapter.js';
import { createGovernorAdapter } from './adapters/governor-adapter.js';
import { createPlannerAdapter } from './adapters/planner-adapter.js';
import { createCritiqueAdapter } from './adapters/critique-adapter.js';
import { createFirewallAdapter } from './adapters/firewall-adapter.js';
import { createSkillsAdapter } from './adapters/skills-adapter.js';
import { createMemoryServer } from './servers/memory.js';
import { createObserverServer } from './servers/observer.js';
import { createFirewallServer } from './servers/firewall.js';
import { createCritiqueServer } from './servers/critique.js';
import { createPlannerServer } from './servers/planner.js';
import { createGovernorServer } from './servers/governor.js';
import { createSkillsServer } from './servers/skills.js';
import { parseArgs } from 'node:util';

export function createCombinedMcpServer(dbPath: string) {
  const brain = createBrainAdapter(dbPath);
  const observer = createObserverAdapter(dbPath);
  const governor = createGovernorAdapter(dbPath);
  const planner = createPlannerAdapter(dbPath);
  const critique = createCritiqueAdapter();
  const firewall = createFirewallAdapter(dbPath);
  const skills = createSkillsAdapter(dbPath);

  const allTools: ToolDef[] = [
    ...createMemoryServer({ brain }).tools,
    ...createObserverServer({ observer }).tools,
    ...createFirewallServer({ firewall }).tools,
    ...createCritiqueServer({ critique }).tools,
    ...createPlannerServer({ planner }).tools,
    ...createGovernorServer({ governor }).tools,
    ...createSkillsServer({ skills }).tools,
  ];

  // Central, in-process governance: every aggregate-server tool call is checked
  // server-side, reusing the same governor the client hook path uses. Enforced
  // even when no client hooks are installed (ARCH-003 / ADR-038).
  return createMcpServer('fbeast', '0.1.0', allTools, {
    governance: createGovernanceGate(governor),
    audit: createAuditSink(observer),
  });
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });

  const server = createCombinedMcpServer(values['db']!);
  server.start().catch((err) => {
    handleStartupFailure('fbeast-mcp', err);
  });
}
