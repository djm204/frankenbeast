import type { ManagedNetworkServiceState } from './network-state-store.js';

export interface NetworkServiceHealthStatus {
  id: string;
  status: 'running' | 'stale';
  inProcess?: boolean;
  hostServiceId?: string;
  channels?: Record<string, boolean>;
}

export async function resolveServiceHealth(
  service: ManagedNetworkServiceState,
  healthcheck: (service: ManagedNetworkServiceState) => Promise<boolean>,
  services: ManagedNetworkServiceState[] = [service],
): Promise<NetworkServiceHealthStatus> {
  if (service.inProcess) {
    const healthSource = service.hostServiceId
      ? services.find((candidate) => candidate.id === service.hostServiceId)
      : undefined;
    const healthy = service.healthUrl
      ? await healthcheck(service)
      : healthSource ? await healthcheck(healthSource) : false;
    return {
      id: service.id,
      status: healthy ? 'running' : 'stale',
      inProcess: true,
      ...(service.hostServiceId ? { hostServiceId: service.hostServiceId } : {}),
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
