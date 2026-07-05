import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { chatServerService } from './services/chat-server-service.js';
import { beastsDaemonService } from './services/beasts-daemon-service.js';
import { dashboardWebService } from './services/dashboard-web-service.js';
import { commsGatewayService } from './services/comms-gateway-service.js';
import { composeService } from './services/compose-service.js';

export type NetworkServiceId = 'beasts-daemon' | 'chat-server' | 'dashboard-web' | 'comms-gateway' | 'compose-infra';
export type NetworkServiceKind = 'app' | 'infra';

export interface NetworkRegistryContext {
  repoRoot: string;
  configFile?: string | undefined;
  configOverrides?: string[] | undefined;
  operatorToken?: string | undefined;
}

export interface NetworkServiceRuntimeConfig {
  host?: string;
  port?: number;
  url?: string;
  wsUrl?: string;
  healthUrl?: string;
  serviceIdentity?: string;
  apiUrl?: string;
  model?: string;
  orchestratorWsUrl?: string;
  channels?: Record<string, boolean>;
  composeFile?: string;
  services?: string[];
  suppressManagedBanner?: boolean;
  inProcess?: boolean;
  hostServiceId?: NetworkServiceId;
  process?: {
    command: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
  };
}

export interface NetworkServiceDefinition {
  id: NetworkServiceId;
  displayName: string;
  kind: NetworkServiceKind;
  dependsOn: NetworkServiceId[];
  configPaths: string[];
  enabled(config: OrchestratorConfig): boolean;
  describe(config: OrchestratorConfig): string;
  buildRuntimeConfig(config: OrchestratorConfig, context: NetworkRegistryContext): NetworkServiceRuntimeConfig;
}

export interface ResolvedNetworkService extends NetworkServiceDefinition {
  runtimeConfig: NetworkServiceRuntimeConfig;
  explanation: string;
}

const NETWORK_SERVICE_DEFINITIONS: NetworkServiceDefinition[] = [
  beastsDaemonService,
  chatServerService,
  dashboardWebService,
  commsGatewayService,
  composeService,
];

export function createNetworkRegistry(): Map<NetworkServiceId, NetworkServiceDefinition> {
  return new Map(NETWORK_SERVICE_DEFINITIONS.map((service) => [service.id, service]));
}

function collectSelectedServiceIds(
  registry: Map<NetworkServiceId, NetworkServiceDefinition>,
  config: OrchestratorConfig,
): Set<NetworkServiceId> {
  const selected = new Set<NetworkServiceId>();

  const includeService = (serviceId: NetworkServiceId): void => {
    if (selected.has(serviceId)) {
      return;
    }

    const service = registry.get(serviceId);
    if (!service) {
      throw new Error(`Unknown network service: ${serviceId}`);
    }

    for (const dependency of service.dependsOn) {
      const dependencyService = registry.get(dependency);
      if (!dependencyService) {
        throw new Error(`Unknown network service: ${dependency}`);
      }
      includeService(dependency);
    }

    selected.add(serviceId);
  };

  for (const service of registry.values()) {
    if (service.enabled(config)) {
      includeService(service.id);
    }
  }

  return selected;
}

function sortServiceIds(
  registry: Map<NetworkServiceId, NetworkServiceDefinition>,
  serviceIds: Set<NetworkServiceId>,
): NetworkServiceId[] {
  const ordered: NetworkServiceId[] = [];
  const visited = new Set<NetworkServiceId>();

  const visit = (serviceId: NetworkServiceId): void => {
    if (visited.has(serviceId)) {
      return;
    }

    visited.add(serviceId);
    const service = registry.get(serviceId);
    if (!service) {
      throw new Error(`Unknown network service: ${serviceId}`);
    }

    for (const dependency of service.dependsOn) {
      if (serviceIds.has(dependency)) {
        visit(dependency);
      }
    }

    ordered.push(serviceId);
  };

  for (const serviceId of serviceIds) {
    visit(serviceId);
  }

  return ordered;
}

export function resolveNetworkServices(
  config: OrchestratorConfig,
  context: NetworkRegistryContext,
): ResolvedNetworkService[] {
  const registry = createNetworkRegistry();
  const selected = collectSelectedServiceIds(registry, config);
  const orderedIds = sortServiceIds(registry, selected);

  return orderedIds.map((serviceId) => {
    const service = registry.get(serviceId);
    if (!service) {
      throw new Error(`Unknown network service: ${serviceId}`);
    }

    return {
      ...service,
      runtimeConfig: service.buildRuntimeConfig(config, context),
      explanation: service.describe(config),
    };
  });
}

export function filterNetworkServices(
  services: ResolvedNetworkService[],
  target: string | undefined,
): ResolvedNetworkService[] {
  if (!target || target === 'all') {
    return services;
  }

  const included = new Set<NetworkServiceId>();
  const byId = new Map(services.map((service) => [service.id, service]));

  const include = (serviceId: NetworkServiceId): void => {
    if (included.has(serviceId)) {
      return;
    }

    const service = byId.get(serviceId);
    if (!service) {
      return;
    }

    for (const dependency of service.dependsOn) {
      if (byId.has(dependency)) {
        include(dependency);
      }
    }

    included.add(serviceId);
  };

  const selectedService = services.find((service) => service.id === target);
  if (!selectedService) {
    throw new Error(`Unknown network service target: ${target}`);
  }

  include(selectedService.id);
  return services.filter((service) => included.has(service.id));
}
