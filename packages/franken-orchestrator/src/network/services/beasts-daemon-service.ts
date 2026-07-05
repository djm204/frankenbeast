import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import { localPlaintextOrSecureEndpoint, localPlaintextOrSecureHealthUrl } from '../network-url.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

export const beastsDaemonService: NetworkServiceDefinition = {
  id: 'beasts-daemon',
  displayName: 'Beast Daemon',
  kind: 'app',
  dependsOn: [],
  configPaths: ['beastsDaemon.enabled', 'beastsDaemon.host', 'beastsDaemon.port', 'network.operatorTokenRef'],
  enabled: (config: OrchestratorConfig) => config.beastsDaemon.enabled,
  describe: (config: OrchestratorConfig) =>
    `Enabled when beastsDaemon.enabled=true; serves the Beast control API on ${config.beastsDaemon.host}:${config.beastsDaemon.port}.`,
  buildRuntimeConfig: (config: OrchestratorConfig, context) => ({
    host: config.beastsDaemon.host,
    port: config.beastsDaemon.port,
    url: localPlaintextOrSecureEndpoint(config.beastsDaemon.host, config.beastsDaemon.port),
    healthUrl: localPlaintextOrSecureHealthUrl(config.beastsDaemon.host, config.beastsDaemon.port),
    serviceIdentity: 'beasts-daemon',
    process: {
      command: 'npm',
      args: [
        '--silent',
        '--workspace',
        'franken-orchestrator',
        'run',
        'beasts-daemon',
        '--',
        '--host',
        config.beastsDaemon.host,
        '--port',
        String(config.beastsDaemon.port),
      ],
      cwd: context.repoRoot,
      env: {
        FRANKENBEAST_NETWORK_MANAGED: '1',
        FRANKENBEAST_BEAST_DAEMON_URL: localPlaintextOrSecureEndpoint(
          config.beastsDaemon.host,
          config.beastsDaemon.port,
        ),
      },
    },
  }),
};
