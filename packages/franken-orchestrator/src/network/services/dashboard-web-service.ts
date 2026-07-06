import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import { localPlaintextOrSecureEndpoint, localPlaintextOrSecureHealthUrl } from '../network-url.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

export const dashboardWebService: NetworkServiceDefinition = {
  id: 'dashboard-web',
  displayName: 'Dashboard Web',
  kind: 'app',
  dependsOn: ['beasts-daemon', 'chat-server'],
  configPaths: ['dashboard.enabled', 'dashboard.host', 'dashboard.port', 'dashboard.apiUrl'],
  enabled: (config: OrchestratorConfig) => config.dashboard.enabled,
  describe: (config: OrchestratorConfig) =>
    `Enabled when dashboard.enabled=true; builds franken-web and serves the static dashboard on ${config.dashboard.host}:${config.dashboard.port}.`,
  buildRuntimeConfig: (config: OrchestratorConfig, context) => ({
    host: config.dashboard.host,
    port: config.dashboard.port,
    url: localPlaintextOrSecureEndpoint(config.dashboard.host, config.dashboard.port),
    healthUrl: localPlaintextOrSecureHealthUrl(config.dashboard.host, config.dashboard.port),
    serviceIdentity: 'dashboard-web',
    apiUrl: config.dashboard.apiUrl,
    process: {
      command: 'node',
      args: [
        'packages/franken-orchestrator/dist/http/dashboard-static-server.js',
        '--host',
        config.dashboard.host,
        '--port',
        String(config.dashboard.port),
        '--static-dir',
        'packages/franken-web/dist',
        '--api-target',
        config.dashboard.apiUrl,
        '--build-command',
        'npm',
        '--build-args',
        '--workspace',
        '@franken/web',
        'run',
        'build',
      ],
      cwd: context.repoRoot,
      env: {
        FRANKENBEAST_CONFIG_FILE: context.configFile ?? '',
        FRANKENBEAST_DASHBOARD_API_URL: config.dashboard.apiUrl,
        FRANKENBEAST_DASHBOARD_HOST: config.dashboard.host,
        FRANKENBEAST_DASHBOARD_PORT: String(config.dashboard.port),
        ...(context.allowTrustedProviderCommandOverrides
          ? { FRANKENBEAST_TRUST_PROVIDER_COMMAND_OVERRIDES: '1' }
          : {}),
      },
    },
  }),
};
