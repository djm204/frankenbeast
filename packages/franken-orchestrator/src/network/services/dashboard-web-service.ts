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
  buildRuntimeConfig: (config: OrchestratorConfig, context) => ({
    host: config.dashboard.host,
    port: config.dashboard.port,
    url: `http://${config.dashboard.host}:${config.dashboard.port}`,
    serviceIdentity: 'dashboard-web',
    apiUrl: config.dashboard.apiUrl,
    process: {
      command: 'npm',
      args: [
        '--workspace',
        '@frankenbeast/web',
        'run',
        'dev',
        '--',
        '--host',
        config.dashboard.host,
        '--port',
        String(config.dashboard.port),
      ],
      cwd: context.repoRoot,
      env: {
        VITE_API_URL: '',
        VITE_API_PROXY_TARGET: config.dashboard.apiUrl,
      },
    },
  }),
};
