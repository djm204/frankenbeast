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
  return service.status === 'running' ? 'healthy' : 'unavailable';
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
  return services?.find((service) => candidates.includes(service.id));
}

function backgroundLoopDependencies(services: readonly NetworkServiceHealthStatus[] | undefined): DashboardDependencySnapshot[] {
  const channelEntries = services?.flatMap((service) => (
    Object.entries(service.channels ?? {}).map(([channel, healthy]) => ({ serviceId: service.id, channel, healthy }))
  )) ?? [];

  if (channelEntries.length === 0) {
    return [dependency(
      'background-loops',
      'background-loop',
      'unknown',
      'No background loop channels are reported by the managed service state.',
      'Start the managed network or check service channel instrumentation.',
      ['Manual CLI workflows can continue; do not assume asynchronous delivery loops are healthy.'],
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
  const dependencies: DashboardDependencySnapshot[] = [
    serviceDependency(
      'web-ui',
      'web',
      findService(services, ['dashboard-web', 'web-ui', 'franken-web']),
      'Run `frankenbeast network status` and restart the dashboard service if needed.',
    ),
    serviceDependency(
      'orchestrator-api',
      'orchestrator',
      findService(services, ['chat-server', 'orchestrator-api', 'beasts-daemon']),
      'Run `frankenbeast network status` and restart chat-server or beasts-daemon if needed.',
    ),
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
