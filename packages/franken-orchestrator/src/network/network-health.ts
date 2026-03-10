import type { ManagedNetworkServiceState } from './network-state-store.js';

export interface NetworkServiceHealthStatus {
  id: string;
  status: 'running' | 'stale';
}

export async function resolveServiceHealth(
  service: ManagedNetworkServiceState,
  healthcheck: (service: ManagedNetworkServiceState) => Promise<boolean>,
): Promise<NetworkServiceHealthStatus> {
  const healthy = await healthcheck(service);
  return {
    id: service.id,
    status: healthy ? 'running' : 'stale',
  };
}
