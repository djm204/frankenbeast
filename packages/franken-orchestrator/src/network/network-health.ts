import type { ManagedNetworkServiceState } from './network-state-store.js';

export interface NetworkServiceHealthStatus {
  id: string;
  status: 'running' | 'stale';
  inProcess?: boolean;
  channels?: Record<string, boolean>;
}

export async function resolveServiceHealth(
  service: ManagedNetworkServiceState,
  healthcheck: (service: ManagedNetworkServiceState) => Promise<boolean>,
): Promise<NetworkServiceHealthStatus> {
  if (service.inProcess) {
    return {
      id: service.id,
      status: 'running',
      inProcess: true,
      ...(service.channels ? { channels: service.channels } : {}),
    };
  }

  const healthy = await healthcheck(service);
  return {
    id: service.id,
    status: healthy ? 'running' : 'stale',
    ...(service.channels ? { channels: service.channels } : {}),
  };
}
