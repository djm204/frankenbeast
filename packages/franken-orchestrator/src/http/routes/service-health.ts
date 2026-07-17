import type {
  DashboardAvailabilitySnapshot,
  DashboardDependencySnapshot,
  DashboardDependencyStatus,
  DashboardProviderSnapshot,
} from './dashboard-status.js';
import { buildDashboardAvailabilitySnapshot } from './dashboard-status.js';
import type { NetworkServiceHealthStatus } from '../../network/network-health.js';

export interface ServiceHealthAggregatorInput {
  readonly providers?: readonly DashboardProviderSnapshot[] | undefined;
  readonly dependencies?: readonly DashboardDependencySnapshot[] | undefined;
  readonly networkServices?: readonly NetworkServiceHealthStatus[] | undefined;
  readonly github?: DashboardDependencySnapshot | undefined;
  readonly stateStore?: DashboardDependencySnapshot | undefined;
  readonly backgroundLoops?: readonly DashboardDependencySnapshot[] | undefined;
}

function normalizeServiceStatus(service?: NetworkServiceHealthStatus | undefined): DashboardDependencyStatus {
  if (!service) return 'unknown';
  if (service.status === 'running') return 'healthy';
  if (service.status === 'degraded') return 'degraded';
  return 'unavailable';
}

function dependency(
  name: string,
  type: string,
  status: DashboardDependencyStatus,
  summary: string,
  remediationHint: string,
  safeWork: readonly string[],
): DashboardDependencySnapshot {
  return {
    name,
    type,
    status,
    summary,
    remediationHint,
    safeWork: [...safeWork],
  };
}

function serviceDependency(
  name: string,
  type: string,
  service: NetworkServiceHealthStatus | undefined,
  docsHint: string,
): DashboardDependencySnapshot {
  const status = normalizeServiceStatus(service);
  if (status === 'healthy') {
    return dependency(
      name,
      type,
      status,
      `${name} is reachable through the managed service supervisor.`,
      'No remediation needed.',
      ['Traffic that depends on this service can continue.'],
    );
  }
  if (status === 'degraded') {
    return dependency(
      name,
      type,
      status,
      `${name} is reachable but reported degraded health.`,
      docsHint,
      ['Existing traffic may continue; avoid scaling up dependent work until degradation clears.'],
    );
  }
  if (status === 'unavailable') {
    return dependency(
      name,
      type,
      status,
      `${name} is registered but its health probe is stale or failing.`,
      docsHint,
      ['Avoid starting new work that depends on this service until it is healthy.'],
    );
  }
  return dependency(
    name,
    type,
    'unknown',
    `${name} is not present in the managed service state.`,
    docsHint,
    ['Use local-only workflows or start the managed network before relying on this service.'],
  );
}

function findService(services: readonly NetworkServiceHealthStatus[] | undefined, candidates: readonly string[]): NetworkServiceHealthStatus | undefined {
  for (const candidate of candidates) {
    const service = services?.find((entry) => entry.id === candidate);
    if (service) return service;
  }
  return undefined;
}

function findServices(services: readonly NetworkServiceHealthStatus[] | undefined, candidates: readonly string[]): NetworkServiceHealthStatus[] {
  return candidates.flatMap((candidate) => {
    const service = services?.find((entry) => entry.id === candidate);
    return service ? [service] : [];
  });
}

function backgroundLoopDependencies(services: readonly NetworkServiceHealthStatus[] | undefined): DashboardDependencySnapshot[] {
  const channelEntries = services?.flatMap((service) => (
    Object.entries(service.channels ?? {})
      .filter(([, enabled]) => enabled)
      .map(([channel]) => ({ serviceId: service.id, channel, healthy: service.status === 'running' }))
  )) ?? [];

  if (channelEntries.length === 0) {
    return [dependency(
      'background-loops',
      'background-loop',
      'healthy',
      'No optional background loop channels are enabled in the managed service state.',
      'No remediation needed.',
      ['Synchronous CLI workflows can continue; enable a comms channel before relying on asynchronous delivery loops.'],
    )];
  }

  const failed = channelEntries.filter((entry) => !entry.healthy);
  return [dependency(
    'background-loops',
    'background-loop',
    failed.length === 0 ? 'healthy' : 'degraded',
    failed.length === 0
      ? `${channelEntries.length} background loop channel${channelEntries.length === 1 ? '' : 's'} are reporting healthy.`
      : `${failed.length}/${channelEntries.length} background loop channel${channelEntries.length === 1 ? '' : 's'} are degraded: ${failed.map((entry) => `${entry.serviceId}:${entry.channel}`).join(', ')}.`,
    failed.length === 0
      ? 'No remediation needed.'
      : 'Inspect the named service channel logs and restart the managed service if the channel remains degraded.',
    failed.length === 0
      ? ['Asynchronous delivery and polling workflows can continue.']
      : ['Continue synchronous CLI or local work; avoid depending on degraded asynchronous loops.'],
  )];
}

export function buildServiceHealthSnapshot(input: ServiceHealthAggregatorInput): DashboardAvailabilitySnapshot {
  const services = input.networkServices;
  const webService = findService(services, ['dashboard-web', 'web-ui', 'franken-web']);
  const orchestratorServices = findServices(services, ['chat-server', 'orchestrator-api', 'beasts-daemon']);
  const serviceDependencies: DashboardDependencySnapshot[] = [];
  if (webService || services === undefined) {
    serviceDependencies.push(serviceDependency(
      'web-ui',
      'web',
      webService,
      'Run `frankenbeast network status` and restart the dashboard service if needed.',
    ));
  }
  if (services === undefined) {
    serviceDependencies.push(serviceDependency(
      'orchestrator-api',
      'orchestrator',
      undefined,
      'Run `frankenbeast network status` and restart chat-server or beasts-daemon if needed.',
    ));
  }
  for (const service of orchestratorServices) {
    serviceDependencies.push(serviceDependency(
      service.id === 'chat-server' || service.id === 'orchestrator-api' ? 'orchestrator-api' : service.id,
      'orchestrator',
      service,
      'Run `frankenbeast network status` and restart chat-server or beasts-daemon if needed.',
    ));
  }
  const dependencies: DashboardDependencySnapshot[] = [
    ...serviceDependencies,
    input.github ?? dependency(
      'github-api',
      'github',
      'unknown',
      'GitHub connectivity has not been checked by this process.',
      'Configure gh authentication or a GitHub token before issue/PR automation.',
      ['Continue work that does not require GitHub reads or writes.'],
    ),
    input.stateStore ?? dependency(
      'state-store',
      'state-store',
      'unknown',
      'State-store health has not been checked by this process.',
      'Verify the project .fbeast directory and state-store permissions.',
      ['Avoid operations that need persisted orchestration state until verified.'],
    ),
    ...backgroundLoopDependencies(services),
    ...(input.backgroundLoops ?? []),
    ...(input.dependencies ?? []),
  ];

  return buildDashboardAvailabilitySnapshot(input.providers ?? [], dependencies);
}
