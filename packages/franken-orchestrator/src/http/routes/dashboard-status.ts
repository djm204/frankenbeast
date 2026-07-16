export type DashboardDependencyStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export interface DashboardProviderSnapshot {
  name: string;
  type: string;
  available: boolean;
  failoverOrder: number;
  model?: string | undefined;
}

export interface DashboardDependencySnapshot {
  name: string;
  type: string;
  status: DashboardDependencyStatus;
  summary: string;
  remediationHint: string;
  safeWork: string[];
}

export interface DashboardAvailabilitySnapshot {
  status: DashboardDependencyStatus;
  dependencies: DashboardDependencySnapshot[];
}

const STATUS_RANK: Record<DashboardDependencyStatus, number> = {
  healthy: 0,
  degraded: 1,
  unknown: 2,
  unavailable: 3,
};

function normalizeDependency(dependency: DashboardDependencySnapshot): DashboardDependencySnapshot {
  const safeWork = dependency.safeWork.length > 0
    ? [...dependency.safeWork]
    : ['Inspect this dependency before starting work that relies on it.'];

  return {
    ...dependency,
    summary: dependency.summary.trim() || `${dependency.name} status is ${dependency.status}.`,
    remediationHint: dependency.remediationHint.trim() || 'Inspect dependency configuration and upstream status.',
    safeWork,
  };
}

function providerToDependency(
  provider: DashboardProviderSnapshot,
  allProviders: readonly DashboardProviderSnapshot[],
): DashboardDependencySnapshot {
  const status: DashboardDependencyStatus = provider.available ? 'healthy' : 'unavailable';
  const hasFailover = allProviders.some((candidate) => candidate.available && candidate.failoverOrder > provider.failoverOrder);
  const modelSuffix = provider.model ? ` using ${provider.model}` : '';

  return normalizeDependency({
    name: provider.name,
    type: `provider:${provider.type}`,
    status,
    summary: provider.available
      ? `${provider.name}${modelSuffix} is available for failover slot #${provider.failoverOrder + 1}.`
      : `${provider.name}${modelSuffix} is unavailable at failover slot #${provider.failoverOrder + 1}.`,
    remediationHint: provider.available
      ? 'No remediation needed.'
      : `Check ${provider.name} credentials, CLI installation, or upstream provider status.`,
    safeWork: provider.available
      ? ['Provider-backed work can use this provider.']
      : hasFailover
        ? ['Route provider-backed work to the next available failover provider.', 'Continue work that does not require this provider.']
        : ['Defer new provider-backed work until a provider is available.', 'Continue local-only review or documentation work.'],
  });
}

function summarizeOverallStatus(
  providers: readonly DashboardProviderSnapshot[],
  dependencies: readonly DashboardDependencySnapshot[],
): DashboardDependencyStatus {
  if (dependencies.length === 0) return 'unknown';

  const nonProviderDependencies = dependencies.filter((dependency) => !dependency.type.startsWith('provider:'));
  const allProvidersUnavailable = providers.length > 0 && providers.every((provider) => !provider.available);
  const anyNonProviderUnavailable = nonProviderDependencies.some((dependency) => dependency.status === 'unavailable');

  if (allProvidersUnavailable || anyNonProviderUnavailable) return 'unavailable';

  const worst = dependencies.reduce<DashboardDependencyStatus>((current, dependency) => (
    STATUS_RANK[dependency.status] > STATUS_RANK[current] ? dependency.status : current
  ), 'healthy');

  if (worst === 'unavailable') return 'degraded';
  return worst;
}

export function buildDashboardAvailabilitySnapshot(
  providers: readonly DashboardProviderSnapshot[],
  dependencies: readonly DashboardDependencySnapshot[] = [],
): DashboardAvailabilitySnapshot {
  const providerDependencies = [...providers]
    .sort((a, b) => a.failoverOrder - b.failoverOrder)
    .map((provider) => providerToDependency(provider, providers));
  const normalizedDependencies = dependencies.map(normalizeDependency);
  const combined = [...providerDependencies, ...normalizedDependencies];

  return {
    status: summarizeOverallStatus(providers, combined),
    dependencies: combined,
  };
}
