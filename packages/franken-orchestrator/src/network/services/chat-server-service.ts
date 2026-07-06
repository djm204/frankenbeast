import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import {
  localPlaintextOrSecureEndpoint,
  localPlaintextOrSecureHealthUrl,
  localPlaintextOrSecureWebSocketUrl,
} from '../network-url.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

export const chatServerService: NetworkServiceDefinition = {
  id: 'chat-server',
  displayName: 'Chat Server',
  kind: 'app',
  dependsOn: ['beasts-daemon'],
  configPaths: ['chat.enabled', 'chat.host', 'chat.port', 'chat.model'],
  enabled: (config: OrchestratorConfig) => config.chat.enabled,
  describe: (config: OrchestratorConfig) =>
    `Enabled when chat.enabled=true; serves websocket chat on ${config.chat.host}:${config.chat.port}.`,
  buildRuntimeConfig: (config: OrchestratorConfig, context) => ({
    host: config.chat.host,
    port: config.chat.port,
    url: localPlaintextOrSecureEndpoint(config.chat.host, config.chat.port),
    healthUrl: localPlaintextOrSecureHealthUrl(config.chat.host, config.chat.port),
    wsUrl: localPlaintextOrSecureWebSocketUrl(config.chat.host, config.chat.port, '/v1/chat/ws'),
    serviceIdentity: 'chat-server',
    suppressManagedBanner: true,
    model: config.chat.model,
    process: {
      command: 'npm',
      args: [
        '--silent',
        '--workspace',
        '@franken/orchestrator',
        'run',
        'chat-server',
        '--',
        '--host',
        config.chat.host,
        '--port',
        String(config.chat.port),
        ...(context.configFile ? ['--config', context.configFile] : []),
        ...(context.allowTrustedProviderCommandOverrides ? ['--trust-provider-command-overrides'] : []),
        ...(context.configOverrides?.flatMap((override) => ['--set', override]) ?? []),
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
