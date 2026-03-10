import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { chatServerService } from './services/chat-server-service.js';
import { dashboardWebService } from './services/dashboard-web-service.js';
import { commsGatewayService } from './services/comms-gateway-service.js';
import { composeService } from './services/compose-service.js';

export type NetworkServiceId = 'chat-server' | 'dashboard-web' | 'comms-gateway' | 'compose-infra';
export type NetworkServiceKind = 'app' | 'infra';

export interface NetworkRegistryContext {
  repoRoot: string;
}

export interface NetworkServiceRuntimeConfig {
  host?: string;
  port?: number;
  url?: string;
  wsUrl?: string;
  apiUrl?: string;
  model?: string;
  orchestratorWsUrl?: string;
  channels?: Record<string, boolean>;
  composeFile?: string;
  services?: string[];
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
