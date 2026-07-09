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
  private readonly startupAttemptsExplicit: boolean;
  private readonly startupDelayMs: number;

  constructor(private readonly deps: NetworkSupervisorDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.startupAttemptsExplicit = deps.startupAttempts !== undefined;
    this.startupAttempts = deps.startupAttempts ?? 20;
    this.startupDelayMs = deps.startupDelayMs ?? 250;
  }

  private createInProcessState(
    service: ResolvedNetworkService,
    startedAt: string,
    detached: boolean,
  ): ManagedNetworkServiceState {
    return {
      id: service.id,
      pid: 0,
      detached,
      dependsOn: [...service.dependsOn],
      startedAt,
      status: 'already-running',
      inProcess: true,
      ...(service.runtimeConfig.url ? { url: service.runtimeConfig.url } : {}),
      ...(service.runtimeConfig.healthUrl ? { healthUrl: service.runtimeConfig.healthUrl } : {}),
      ...(service.runtimeConfig.serviceIdentity ? { serviceIdentity: service.runtimeConfig.serviceIdentity } : {}),
      ...(service.runtimeConfig.channels ? { channels: service.runtimeConfig.channels } : {}),
      ...(service.runtimeConfig.hostServiceId ? { hostServiceId: service.runtimeConfig.hostServiceId } : {}),
    };
  }

  private async startManagedService(
    service: ResolvedNetworkService,
    detached: boolean,
    startedAt: string,
  ): Promise<ManagedNetworkServiceState> {
    const logFile = detached ? await this.deps.logStore.register(service.id) : undefined;
    const { pid } = await this.deps.startService(service, {
      detached,
      ...(logFile ? { logFile } : {}),
    });
    return {
      id: service.id,
      pid,
      detached,
      dependsOn: [...service.dependsOn],
      startedAt,
      status: 'started',
      ...(logFile ? { logFile } : {}),
      ...(service.runtimeConfig.url ? { url: service.runtimeConfig.url } : {}),
      ...(service.runtimeConfig.healthUrl ? { healthUrl: service.runtimeConfig.healthUrl } : {}),
      ...(service.runtimeConfig.serviceIdentity ? { serviceIdentity: service.runtimeConfig.serviceIdentity } : {}),
    };
  }

  private async restartReusedHostForInProcessService(
    serviceState: ManagedNetworkServiceState,
    services: ManagedNetworkServiceState[],
    resolvedServices: ResolvedNetworkService[],
    detached: boolean,
    startedAt: string,
  ): Promise<boolean> {
    const hostServiceId = serviceState.hostServiceId;
    if (!hostServiceId) {
      return false;
    }
    const hostIndex = services.findIndex((candidate) => candidate.id === hostServiceId);
    const hostState = hostIndex >= 0 ? services[hostIndex] : undefined;
    if (!hostState || hostState.status !== 'already-running') {
      return false;
    }
    const hostService = resolvedServices.find((candidate) => candidate.id === hostServiceId);
    if (!hostService) {
      return false;
    }
    if (hostState.pid <= 0) {
      throw new Error(
        `Cannot enable ${serviceState.id}: host service ${hostServiceId} is already running outside this network state; stop that process and retry.`,
      );
    }

    await this.deps.stopService(hostState);
    const stopped = await this.waitForStopped(hostState);
    if (!stopped) {
      throw new Error(
        `Cannot enable ${serviceState.id}: host service ${hostServiceId} did not stop before restart; stop that process and retry.`,
      );
    }
    const restartedHost = await this.startManagedService(hostService, detached, startedAt);
    services[hostIndex] = restartedHost;
    return this.waitForHealthy(restartedHost);
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
        if (service.runtimeConfig.inProcess === true) {
          const serviceState = this.createInProcessState(service, startedAt, options.detached);
          services.push(serviceState);
          let healthy = await this.waitForHealthy(serviceState);
          if (!healthy) {
            const hostRestarted = await this.restartReusedHostForInProcessService(
              serviceState,
              services,
              options.services,
              options.detached,
              startedAt,
            );
            healthy = hostRestarted ? await this.waitForHealthy(serviceState) : false;
          }
          if (!healthy) {
            throw new Error(`Service ${service.id} failed healthcheck during startup`);
          }
          continue;
        }

        const preflight = await this.resolvePreflight(service);
        if (preflight.action === 'conflict') {
          throw new Error(preflight.reason ?? `Port conflict for ${service.id}`);
        }

        if (preflight.action === 'reuse') {
          const existingService = existingState?.services.find((candidate) => candidate.id === service.id);
          const reusedService: ManagedNetworkServiceState = {
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
            ...(service.runtimeConfig.channels ? { channels: service.runtimeConfig.channels } : existingService?.channels ? { channels: existingService.channels } : {}),
            ...(service.runtimeConfig.hostServiceId ? { hostServiceId: service.runtimeConfig.hostServiceId } : existingService?.hostServiceId ? { hostServiceId: existingService.hostServiceId } : {}),
            ...(existingService?.inProcess ? { inProcess: existingService.inProcess } : {}),
          };
          services.push(reusedService);
          if (!await this.waitForHealthy(reusedService)) {
            throw new Error(`Service ${service.id} failed healthcheck during startup`);
          }
          continue;
        }

        const serviceState = await this.startManagedService(service, options.detached, startedAt);
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

    const targetState = target === 'all' ? undefined : state.services.find((service) => service.id === target);
    if (targetState && isInProcessService(targetState)) {
      throw new Error(
        `Service ${target} is hosted in-process by chat-server; stop chat-server or all services instead.`,
      );
    }

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
    return await this.deps.logStore.resolve(state, target);
  }

  async status(_registry?: Map<string, NetworkServiceDefinition>): Promise<NetworkSupervisorStatus> {
    const state = await this.deps.stateStore.load();
    if (!state) {
      return { services: [] };
    }

    const services = await Promise.all(
      state.services.map((service) => resolveServiceHealth(service, this.deps.healthcheck, state.services)),
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
    const startupAttempts = service.serviceIdentity === 'dashboard-web' && !this.startupAttemptsExplicit
      ? Math.max(this.startupAttempts, 240)
      : this.startupAttempts;
    for (let attempt = 0; attempt < startupAttempts; attempt += 1) {
      if (await this.deps.healthcheck(service)) {
        return true;
      }
      if (attempt < startupAttempts - 1) {
        await sleep(this.startupDelayMs);
      }
    }
    return false;
  }

  private async waitForStopped(service: ManagedNetworkServiceState): Promise<boolean> {
    for (let attempt = 0; attempt < this.startupAttempts; attempt += 1) {
      if (!await this.deps.healthcheck(service)) {
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

function isInProcessService(service: ManagedNetworkServiceState): boolean {
  return service.inProcess === true;
}
