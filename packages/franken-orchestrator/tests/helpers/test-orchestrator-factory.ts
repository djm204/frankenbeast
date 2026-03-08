/**
 * Factory for creating test orchestrator instances.
 * Follows the `createTestBeast()` pattern — wire everything with
 * in-memory ports, allow per-test overrides.
 */

import { BeastLoop } from '../../src/beast-loop.js';
import type { BeastLoopDeps, ILogger } from '../../src/deps.js';
import { NullLogger } from '../../src/logger.js';
import type { OrchestratorConfig } from '../../src/config/orchestrator-config.js';
import {
  InMemoryFirewall,
  InMemorySkills,
  InMemoryMemory,
  InMemoryPlanner,
  InMemoryObserver,
  InMemoryCritique,
  InMemoryGovernor,
  InMemoryHeartbeat,
} from './in-memory-ports.js';
import type {
  InMemoryFirewallOptions,
  InMemoryPlannerOptions,
  InMemoryCritiqueOptions,
  InMemoryGovernorOptions,
} from './in-memory-ports.js';

export interface TestOrchestratorPorts {
  readonly firewall: InMemoryFirewall;
  readonly skills: InMemorySkills;
  readonly memory: InMemoryMemory;
  readonly planner: InMemoryPlanner;
  readonly observer: InMemoryObserver;
  readonly critique: InMemoryCritique;
  readonly governor: InMemoryGovernor;
  readonly heartbeat: InMemoryHeartbeat;
  readonly logger: ILogger;
}

export interface TestOrchestratorOverrides {
  firewall?: InMemoryFirewallOptions;
  planner?: InMemoryPlannerOptions;
  critique?: InMemoryCritiqueOptions;
  governor?: InMemoryGovernorOptions;
  logger?: ILogger;
  config?: Partial<OrchestratorConfig>;
}

export interface TestOrchestrator {
  readonly loop: BeastLoop;
  readonly ports: TestOrchestratorPorts;
}

/**
 * Creates a fully wired BeastLoop with in-memory ports.
 * Each port maintains real state so E2E tests can inspect side effects.
 */
export function createTestOrchestrator(
  overrides: TestOrchestratorOverrides = {},
): TestOrchestrator {
  const logger = overrides.logger ?? new NullLogger();
  const ports: TestOrchestratorPorts = {
    firewall: new InMemoryFirewall(overrides.firewall),
    skills: new InMemorySkills(),
    memory: new InMemoryMemory(),
    planner: new InMemoryPlanner(overrides.planner),
    observer: new InMemoryObserver(),
    critique: new InMemoryCritique(overrides.critique),
    governor: new InMemoryGovernor(overrides.governor),
    heartbeat: new InMemoryHeartbeat(),
    logger,
  };

  const deps: BeastLoopDeps = {
    firewall: ports.firewall,
    skills: ports.skills,
    memory: ports.memory,
    planner: ports.planner,
    observer: ports.observer,
    critique: ports.critique,
    governor: ports.governor,
    heartbeat: ports.heartbeat,
    logger: ports.logger,
    clock: () => new Date('2025-01-15T10:00:00Z'),
  };

  const loop = new BeastLoop(deps, overrides.config);

  return { loop, ports };
}
