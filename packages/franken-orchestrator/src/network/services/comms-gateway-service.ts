import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import { localPlaintextOrSecureEndpoint, localPlaintextOrSecureHealthUrl } from '../network-url.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

function hasEnabledChannels(config: OrchestratorConfig): boolean {
  return config.comms.slack.enabled
    || config.comms.discord.enabled
    || config.comms.telegram.enabled
    || config.comms.whatsapp.enabled;
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
    'comms.telegram.enabled',
    'comms.whatsapp.enabled',
  ],
  enabled: (config: OrchestratorConfig) => config.comms.enabled || hasEnabledChannels(config),
  describe: (config: OrchestratorConfig) =>
    'Enabled when comms.enabled=true or a channel is enabled; current channel flags '
      + `slack=${config.comms.slack.enabled} discord=${config.comms.discord.enabled} `
      + `telegram=${config.comms.telegram.enabled} whatsapp=${config.comms.whatsapp.enabled}.`,
  buildRuntimeConfig: (config: OrchestratorConfig) => ({
    host: config.chat.host,
    port: config.chat.port,
    url: localPlaintextOrSecureEndpoint(config.chat.host, config.chat.port),
    healthUrl: localPlaintextOrSecureHealthUrl(config.chat.host, config.chat.port, '/comms/health'),
    orchestratorWsUrl: config.comms.orchestratorWsUrl,
    channels: {
      slack: config.comms.slack.enabled,
      discord: config.comms.discord.enabled,
      telegram: config.comms.telegram.enabled,
      whatsapp: config.comms.whatsapp.enabled,
    },
    // Comms webhook routes are now served in-process on the orchestrator's Hono server
    // via commsRoutes() registered in chat-app.ts — no separate process needed.
    inProcess: true,
    hostServiceId: 'chat-server',
  }),
};
