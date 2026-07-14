import { describe, expect, it, vi } from 'vitest';
import { TOOL_REGISTRY } from '../shared/tool-registry.js';
import { createCritiqueServer } from './critique.js';
import { createFirewallServer } from './firewall.js';
import { createGovernorServer } from './governor.js';
import { createMemoryServer } from './memory.js';
import { createObserverServer } from './observer.js';
import { createPlannerServer } from './planner.js';
import { createSkillsServer } from './skills.js';

const standaloneServers = [
  {
    registryServer: 'memory',
    createServer: () => createMemoryServer({
      brain: { query: vi.fn(), store: vi.fn(), frontload: vi.fn(), forget: vi.fn(), rightToForget: vi.fn() },
    }),
  },
  {
    registryServer: 'planner',
    createServer: () => createPlannerServer({
      planner: { decompose: vi.fn(), visualize: vi.fn(), validate: vi.fn() },
    }),
  },
  {
    registryServer: 'critique',
    createServer: () => createCritiqueServer({
      critique: { evaluate: vi.fn(), compare: vi.fn() },
    }),
  },
  {
    registryServer: 'firewall',
    createServer: () => createFirewallServer({
      firewall: { scanText: vi.fn(), scanFile: vi.fn() },
    }),
  },
  {
    registryServer: 'observer',
    createServer: () => createObserverServer({
      observer: { log: vi.fn(), logCost: vi.fn(), cost: vi.fn(), trail: vi.fn(), verify: vi.fn() },
    }),
  },
  {
    registryServer: 'governor',
    createServer: () => createGovernorServer({
      governor: { check: vi.fn(), budgetStatus: vi.fn() },
    }),
  },
  {
    registryServer: 'skills',
    createServer: () => createSkillsServer({
      skills: { list: vi.fn(), info: vi.fn() },
    }),
  },
] as const;

describe('standalone MCP servers', () => {
  it('exposes the same tool metadata as the shared registry', () => {
    for (const { registryServer, createServer } of standaloneServers) {
      const serverTools = createServer().tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }));
      const registryTools = [...TOOL_REGISTRY.values()]
        .filter((tool) => tool.server === registryServer)
        .map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        }));

      expect(serverTools, `${registryServer} standalone tools drifted from TOOL_REGISTRY`).toEqual(registryTools);
    }
  });
});
