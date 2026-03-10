import { join } from 'node:path';
import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import type { NetworkServiceDefinition } from '../network-registry.js';

export const composeService: NetworkServiceDefinition = {
  id: 'compose-infra',
  displayName: 'Compose Infra',
  kind: 'infra',
  dependsOn: [],
  configPaths: [],
  enabled: (_config: OrchestratorConfig) => false,
  describe: () => 'Disabled by default; no compose-backed infrastructure is currently required by canonical config.',
  buildRuntimeConfig: (_config: OrchestratorConfig, context) => ({
    composeFile: join(context.repoRoot, 'docker-compose.yml'),
    services: [],
  }),
};
