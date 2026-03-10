import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

export const chatServerService: NetworkServiceDefinition = {
  id: 'chat-server',
  displayName: 'Chat Server',
  kind: 'app',
  dependsOn: [],
  configPaths: ['chat.enabled', 'chat.host', 'chat.port', 'chat.model'],
  enabled: (config: OrchestratorConfig) => config.chat.enabled,
  describe: (config: OrchestratorConfig) =>
    `Enabled when chat.enabled=true; serves websocket chat on ${config.chat.host}:${config.chat.port}.`,
  buildRuntimeConfig: (config: OrchestratorConfig, context) => ({
    host: config.chat.host,
    port: config.chat.port,
    url: `http://${config.chat.host}:${config.chat.port}`,
    healthUrl: `http://${config.chat.host}:${config.chat.port}/health`,
    wsUrl: `ws://${config.chat.host}:${config.chat.port}/v1/chat/ws`,
    model: config.chat.model,
    process: {
      command: 'npm',
      args: [
        '--workspace',
        'franken-orchestrator',
        'run',
        'chat-server',
        '--',
        '--host',
        config.chat.host,
        '--port',
        String(config.chat.port),
      ],
      cwd: context.repoRoot,
    },
  }),
};
