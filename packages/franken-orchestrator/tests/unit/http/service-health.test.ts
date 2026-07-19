import { describe, expect, it } from 'vitest';
import { buildServiceHealthSnapshot } from '../../../src/http/routes/service-health.js';
import type { DashboardDependencySnapshot, DashboardProviderSnapshot } from '../../../src/http/routes/dashboard-status.js';
import type { NetworkServiceHealthStatus } from '../../../src/network/network-health.js';

const healthyProvider: DashboardProviderSnapshot = {
  name: 'openai',
  type: 'openai-api',
  available: true,
  failoverOrder: 0,
};

const healthyGithub: DashboardDependencySnapshot = {
  name: 'github-api',
  type: 'github',
  status: 'healthy',
  summary: 'GitHub API is reachable.',
  remediationHint: 'No remediation needed.',
  safeWork: ['Issue and PR automation can continue.'],
};

const healthyStateStore: DashboardDependencySnapshot = {
  name: 'state-store',
  type: 'state-store',
  status: 'healthy',
  summary: 'State store is writable.',
  remediationHint: 'No remediation needed.',
  safeWork: ['Stateful orchestration can continue.'],
};

const healthyServices: NetworkServiceHealthStatus[] = [
  { id: 'dashboard-web', status: 'running' },
  { id: 'chat-server', status: 'running', channels: { dispatch: true, heartbeat: true } },
];

describe('buildServiceHealthSnapshot', () => {
  it('reports healthy when web, orchestrator, providers, GitHub, state, and loops are healthy', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: healthyServices,
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    expect(snapshot.status).toBe('healthy');
    expect(snapshot.dependencies.map((dependency) => [dependency.name, dependency.status])).toContainEqual(['web-ui', 'healthy']);
    expect(snapshot.dependencies.map((dependency) => [dependency.name, dependency.status])).toContainEqual(['orchestrator-api', 'healthy']);
    expect(snapshot.dependencies.map((dependency) => [dependency.name, dependency.status])).toContainEqual(['background-loops', 'healthy']);
  });

  it('treats absent optional loop channels as healthy/not applicable', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'dashboard-web', status: 'running' },
        { id: 'chat-server', status: 'running' },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    const loops = snapshot.dependencies.find((dependency) => dependency.name === 'background-loops');
    expect(snapshot.status).toBe('healthy');
    expect(loops).toMatchObject({ status: 'healthy' });
    expect(loops?.summary).toContain('No optional background loop channels are enabled');
  });

  it('does not require intentionally disabled web services in the aggregate snapshot', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'chat-server', status: 'running' },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    expect(snapshot.dependencies.map((dependency) => dependency.name)).not.toContain('web-ui');
    expect(snapshot.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'orchestrator-api', status: 'healthy' })]));
    expect(snapshot.status).toBe('healthy');
  });

  it('includes each required orchestrator service in the aggregate snapshot', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'chat-server', status: 'running' },
        { id: 'beasts-daemon', status: 'stale' },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    expect(snapshot.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'orchestrator-api', status: 'healthy' }),
      expect.objectContaining({ name: 'beasts-daemon', status: 'unavailable' }),
    ]));
    expect(snapshot.status).toBe('unavailable');
  });

  it('preserves degraded managed service health in the aggregate snapshot', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'dashboard-web', status: 'degraded' },
        { id: 'chat-server', status: 'running' },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    const web = snapshot.dependencies.find((dependency) => dependency.name === 'web-ui');
    expect(snapshot.status).toBe('degraded');
    expect(web).toMatchObject({ status: 'degraded' });
    expect(web?.summary).toContain('reported degraded health');
  });

  it('reports degraded with remediation hints when an enabled background loop channel is stale', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'dashboard-web', status: 'running' },
        { id: 'chat-server', status: 'running' },
        { id: 'comms-gateway', status: 'stale', channels: { slack: true, discord: false } },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    const loops = snapshot.dependencies.find((dependency) => dependency.name === 'background-loops');
    expect(snapshot.status).toBe('degraded');
    expect(loops).toMatchObject({ status: 'degraded' });
    expect(loops?.summary).toContain('comms-gateway:slack');
    expect(loops?.summary).not.toContain('discord');
    expect(loops?.remediationHint).toContain('logs');
  });

  it('honors candidate priority when selecting the orchestrator API service', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'beasts-daemon', status: 'running' },
        { id: 'chat-server', status: 'stale' },
        { id: 'dashboard-web', status: 'running' },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    const orchestrator = snapshot.dependencies.find((dependency) => dependency.name === 'orchestrator-api');
    expect(snapshot.status).toBe('unavailable');
    expect(orchestrator).toMatchObject({ status: 'unavailable' });
  });

  it('reports unavailable with safe-work guidance when a required service is stale', () => {
    const snapshot = buildServiceHealthSnapshot({
      providers: [healthyProvider],
      networkServices: [
        { id: 'dashboard-web', status: 'stale' },
        { id: 'chat-server', status: 'running', channels: { dispatch: true } },
      ],
      github: healthyGithub,
      stateStore: healthyStateStore,
    });

    const web = snapshot.dependencies.find((dependency) => dependency.name === 'web-ui');
    expect(snapshot.status).toBe('unavailable');
    expect(web).toMatchObject({ status: 'unavailable' });
    expect(web?.remediationHint).toContain('network status');
    expect(web?.safeWork.join(' ')).toContain('Avoid starting new work');
  });
});
