import type { NetworkServiceDefinition, ResolvedNetworkService } from './network-registry.js';
import { resolveServiceHealth, type NetworkServiceHealthStatus } from './network-health.js';
import {
  NetworkStateStore,
  type ManagedNetworkServiceState,
  type NetworkOperatorState,
} from './network-state-store.js';
import { NetworkLogStore } from './network-logs.js';

export interface StartServiceOptions {
  detached: boolean;
  logFile?: string | undefined;
}

export interface PreflightServiceResult {
  action: 'start' | 'reuse' | 'conflict';
  reason?: string | undefined;
}

export interface NetworkSupervisorDeps {
  stateStore: NetworkStateStore;
  logStore: NetworkLogStore;
  startService: (
    service: ResolvedNetworkService,
    options: StartServiceOptions,
  ) => Promise<{ pid: number }>;
  stopService: (service: ManagedNetworkServiceState) => Promise<void>;
  healthcheck: (service: ManagedNetworkServiceState) => Promise<boolean>;
  preflightService?: (service: ResolvedNetworkService) => Promise<PreflightServiceResult>;
  now?: () => string;
  startupAttempts?: number;
  startupDelayMs?: number;
}

export interface NetworkSupervisorStatus {
  mode?: NetworkOperatorState['mode'];
  secureBackend?: string;
  services: NetworkServiceHealthStatus[];
}

function collectDependents(services: ManagedNetworkServiceState[], target: string): ManagedNetworkServiceState[] {
  const included = new Set<string>();

  const include = (serviceId: string): void => {
    if (included.has(serviceId)) {
      return;
    }
    included.add(serviceId);
    for (const service of services) {
      if (service.dependsOn.includes(serviceId)) {
        include(service.id);
      }
    }
  };

  include(target);
  return services.filter((service) => included.has(service.id));
}

export class NetworkSupervisor {
  private readonly now: () => string;
  private readonly startupAttempts: number;
  private readonly startupDelayMs: number;

  constructor(private readonly deps: NetworkSupervisorDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.startupAttempts = deps.startupAttempts ?? 20;
    this.startupDelayMs = deps.startupDelayMs ?? 250;
  }

  async up(options: {
    services: ResolvedNetworkService[];
    detached: boolean;
    mode: NetworkOperatorState['mode'];
    secureBackend: string;
  }): Promise<NetworkOperatorState> {
    const startedAt = this.now();
    const existingState = await this.deps.stateStore.load();
    const services: ManagedNetworkServiceState[] = [];

    try {
      for (const service of options.services) {
        const preflight = await this.resolvePreflight(service);
        if (preflight.action === 'conflict') {
          throw new Error(preflight.reason ?? `Port conflict for ${service.id}`);
        }

        if (preflight.action === 'reuse') {
          const existingService = existingState?.services.find((candidate) => candidate.id === service.id);
          services.push({
            id: existingService?.id ?? service.id,
            pid: existingService?.pid ?? 0,
            detached: existingService?.detached ?? options.detached,
            dependsOn: existingService?.dependsOn ?? [...service.dependsOn],
            startedAt: existingService?.startedAt ?? startedAt,
            status: 'already-running',
            ...(existingService?.logFile ? { logFile: existingService.logFile } : {}),
            ...(service.runtimeConfig.url ? { url: service.runtimeConfig.url } : existingService?.url ? { url: existingService.url } : {}),
            ...(service.runtimeConfig.healthUrl ? { healthUrl: service.runtimeConfig.healthUrl } : existingService?.healthUrl ? { healthUrl: existingService.healthUrl } : {}),
            ...(service.runtimeConfig.serviceIdentity ? { serviceIdentity: service.runtimeConfig.serviceIdentity } : existingService?.serviceIdentity ? { serviceIdentity: existingService.serviceIdentity } : {}),
          });
          continue;
        }

        const logFile = options.detached ? await this.deps.logStore.register(service.id) : undefined;
        const { pid } = await this.deps.startService(service, {
          detached: options.detached,
          ...(logFile ? { logFile } : {}),
        });
        const serviceState: ManagedNetworkServiceState = {
          id: service.id,
          pid,
          detached: options.detached,
          dependsOn: [...service.dependsOn],
          startedAt,
          status: 'started',
          ...(logFile ? { logFile } : {}),
          ...(service.runtimeConfig.url ? { url: service.runtimeConfig.url } : {}),
          ...(service.runtimeConfig.healthUrl ? { healthUrl: service.runtimeConfig.healthUrl } : {}),
          ...(service.runtimeConfig.serviceIdentity ? { serviceIdentity: service.runtimeConfig.serviceIdentity } : {}),
        };
        services.push(serviceState);
        const healthy = await this.waitForHealthy(serviceState);
        if (!healthy) {
          throw new Error(`Service ${service.id} failed healthcheck during startup`);
        }
      }
    } catch (error) {
      await this.stopAll({
        mode: options.mode,
        secureBackend: options.secureBackend,
        detached: options.detached,
        startedAt,
        services: services.filter((service) => service.status === 'started'),
      });
      throw error;
    }

    const state: NetworkOperatorState = {
      mode: options.mode,
      secureBackend: options.secureBackend,
      detached: options.detached,
      startedAt,
      services,
    };

    if (options.detached) {
      await this.deps.stateStore.save(state);
    }

    return state;
  }

  async stopAll(state: NetworkOperatorState): Promise<void> {
    for (const service of [...state.services].reverse()) {
      await this.deps.stopService(service);
    }
  }

  async down(): Promise<void> {
    const state = await this.deps.stateStore.load();
    if (!state) {
      return;
    }

    await this.stopAll(state);
    await this.deps.stateStore.clear();
  }

  async stop(target: string | 'all'): Promise<void> {
    const state = await this.deps.stateStore.load();
    if (!state) {
      return;
    }

    const selected = target === 'all'
      ? state.services
      : collectDependents(state.services, target);

    for (const service of [...selected].reverse()) {
      await this.deps.stopService(service);
    }

    if (target === 'all') {
      await this.deps.stateStore.clear();
      return;
    }

    const remaining = state.services.filter((service) => !selected.some((candidate) => candidate.id === service.id));
    if (remaining.length === 0) {
      await this.deps.stateStore.clear();
      return;
    }

    await this.deps.stateStore.save({
      ...state,
      services: remaining,
    });
  }

  async logs(target: string | 'all'): Promise<string[]> {
    const state = await this.deps.stateStore.load();
    if (!state) {
      return [];
    }
    return this.deps.logStore.resolve(state, target);
  }

  async status(_registry?: Map<string, NetworkServiceDefinition>): Promise<NetworkSupervisorStatus> {
    const state = await this.deps.stateStore.load();
    if (!state) {
      return { services: [] };
    }

    const services = await Promise.all(
      state.services.map((service) => resolveServiceHealth(service, this.deps.healthcheck)),
    );

    return {
      mode: state.mode,
      secureBackend: state.secureBackend,
      services,
    };
  }

  private async resolvePreflight(service: ResolvedNetworkService): Promise<PreflightServiceResult> {
    if (!this.deps.preflightService) {
      return { action: 'start' };
    }
    return this.deps.preflightService(service);
  }

  private async waitForHealthy(service: ManagedNetworkServiceState): Promise<boolean> {
    for (let attempt = 0; attempt < this.startupAttempts; attempt += 1) {
      if (await this.deps.healthcheck(service)) {
        return true;
      }
      if (attempt < this.startupAttempts - 1) {
        await sleep(this.startupDelayMs);
      }
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
