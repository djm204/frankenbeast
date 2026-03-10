import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

export const dashboardWebService: NetworkServiceDefinition = {
  id: 'dashboard-web',
  displayName: 'Dashboard Web',
  kind: 'app',
  dependsOn: ['chat-server'],
  configPaths: ['dashboard.enabled', 'dashboard.host', 'dashboard.port', 'dashboard.apiUrl'],
  enabled: (config: OrchestratorConfig) => config.dashboard.enabled,
  describe: (config: OrchestratorConfig) =>
    `Enabled when dashboard.enabled=true; serves the dashboard on ${config.dashboard.host}:${config.dashboard.port}.`,
  buildRuntimeConfig: (config: OrchestratorConfig) => ({
    host: config.dashboard.host,
    port: config.dashboard.port,
    url: `http://${config.dashboard.host}:${config.dashboard.port}`,
    apiUrl: config.dashboard.apiUrl,
  }),
};
