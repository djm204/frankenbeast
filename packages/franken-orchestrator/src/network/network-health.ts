import type { ManagedNetworkServiceState } from './network-state-store.js';

export interface NetworkServiceHealthStatus {
  id: string;
  status: 'running' | 'degraded' | 'stale';
  inProcess?: boolean;
  hostServiceId?: string;
  channels?: Record<string, boolean>;
}

export async function resolveServiceHealth(
  service: ManagedNetworkServiceState,
  healthcheck: (service: ManagedNetworkServiceState) => Promise<boolean | 'degraded'>,
  services: ManagedNetworkServiceState[] = [service],
): Promise<NetworkServiceHealthStatus> {
  const toStatus = (result: boolean | 'degraded'): NetworkServiceHealthStatus['status'] => {
    if (result === 'degraded') return 'degraded';
    return result ? 'running' : 'stale';
  };

  if (service.inProcess) {
    const healthSource = service.hostServiceId
      ? services.find((candidate) => candidate.id === service.hostServiceId)
      : undefined;
    const result = service.healthUrl
      ? await healthcheck(service)
      : healthSource ? await healthcheck(healthSource) : false;
    return {
      id: service.id,
      status: toStatus(result),
      inProcess: true,
      ...(service.hostServiceId ? { hostServiceId: service.hostServiceId } : {}),
      ...(service.channels ? { channels: service.channels } : {}),
    };
  }

  const result = await healthcheck(service);
  return {
    id: service.id,
    status: toStatus(result),
    ...(service.channels ? { channels: service.channels } : {}),
  };
}
