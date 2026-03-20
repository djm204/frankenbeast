import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

function hasEnabledChannels(config: OrchestratorConfig): boolean {
  return config.comms.slack.enabled || config.comms.discord.enabled;
}

export const commsGatewayService: NetworkServiceDefinition = {
  id: 'comms-gateway',
  displayName: 'Comms Gateway',
  kind: 'app',
  dependsOn: ['chat-server'],
  configPaths: [
    'comms.enabled',
    'comms.host',
    'comms.port',
    'comms.orchestratorWsUrl',
    'comms.slack.enabled',
    'comms.discord.enabled',
  ],
  enabled: (config: OrchestratorConfig) => config.comms.enabled || hasEnabledChannels(config),
  describe: (config: OrchestratorConfig) =>
    `Enabled when comms.enabled=true or a channel is enabled; current channel flags slack=${config.comms.slack.enabled} discord=${config.comms.discord.enabled}.`,
  buildRuntimeConfig: (config: OrchestratorConfig, context) => ({
    host: config.comms.host,
    port: config.comms.port,
    url: `http://${config.comms.host}:${config.comms.port}`,
    orchestratorWsUrl: config.comms.orchestratorWsUrl,
    channels: {
      slack: config.comms.slack.enabled,
      discord: config.comms.discord.enabled,
    },
    // franken-comms absorbed into orchestrator — comms server starts in-process
    // TODO: Phase 4.5 — wire comms startup into orchestrator's server lifecycle
    process: {
      command: 'node',
      args: [
        '--import',
        'tsx',
        'packages/franken-orchestrator/src/comms/server/start-comms-server.ts',
      ],
      cwd: context.repoRoot,
    },
  }),
};
