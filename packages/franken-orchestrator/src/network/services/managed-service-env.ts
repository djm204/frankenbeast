import type { OrchestratorConfig } from '../../config/orchestrator-config.js';
import type { NetworkServiceId } from '../network-registry.js';

const OPERATOR_SECRET_ENV_KEYS = [
  'FRANKENBEAST_BEAST_OPERATOR_TOKEN',
  'FRANKENBEAST_PASSPHRASE',
] as const;

const LEGACY_OPERATOR_SECRET_ENV_KEYS = ['VITE_BEAST_OPERATOR_TOKEN'] as const;

const PROVIDER_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'CODEX_HOME',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_CLI_HOME',
  'GEMINI_CLI_SYSTEM_DEFAULTS_PATH',
  'GEMINI_CLI_SYSTEM_SETTINGS_PATH',
  'GEMINI_CLI_TRUSTED_FOLDERS_PATH',
  'GEMINI_CLI_TRUST_WORKSPACE',
] as const;

const DASHBOARD_BUILD_ENV_KEYS = ['VITE_PROJECT_ID'] as const;

const GITHUB_ENV_KEYS = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'GH_HOST',
  'GH_CONFIG_DIR',
  'GITHUB_API_URL',
  'GITHUB_GRAPHQL_URL',
] as const;

const ORCHESTRATOR_CONFIG_ENV_KEYS = [
  'FRANKEN_MAX_TOTAL_TOKENS',
  'FRANKEN_MAX_DURATION_MS',
  'FRANKEN_MAX_CRITIQUE_ITERATIONS',
  'FRANKEN_ENABLE_HEARTBEAT',
  'FRANKEN_ENABLE_TRACING',
  'FRANKEN_ENABLE_REFLECTION',
  'FRANKEN_MIN_CRITIQUE_SCORE',
] as const;

const MANAGED_RUNTIME_ENV_KEYS = [
  'FRANKENBEAST_ALLOW_MISSING_SAFETY_MODULES',
  'FRANKENBEAST_ALLOW_NONINTERACTIVE_APPROVAL',
  'FBEAST_ROOT',
  'FBEAST_RUN_LOG_MAX_BYTES',
  'FBEAST_RUN_LOG_MAX_ROTATED_FILES',
  'HERMES_KANBAN_DB',
  'CHROMA_URL',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'DOCKER_HOST',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
] as const;

const CONNECTIVITY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CURL_CA_BUNDLE',
  'REQUESTS_CA_BUNDLE',
] as const;

const MODULE_ENV_KEYS = [
  'FRANKENBEAST_MODULE_FIREWALL',
  'FRANKENBEAST_MODULE_SKILLS',
  'FRANKENBEAST_MODULE_MEMORY',
  'FRANKENBEAST_MODULE_PLANNER',
  'FRANKENBEAST_MODULE_CRITIQUE',
  'FRANKENBEAST_MODULE_GOVERNOR',
  'FRANKENBEAST_MODULE_HEARTBEAT',
] as const;

const CAPACITY_ENV_KEYS = [
  'FBEAST_AGENT_CAPACITY_TOTAL',
  'FBEAST_AGENT_CAPACITY_RESERVATIONS',
  'FBEAST_AGENT_CAPACITY_RELEASED_RESERVATIONS',
] as const;

function secretBackendEnvKeys(backend: OrchestratorConfig['network']['secureBackend']): readonly string[] {
  if (backend === 'bitwarden') {
    return ['BW_SESSION', 'BW_CLIENTID', 'BW_CLIENTSECRET', 'BW_PASSWORD'];
  }
  if (backend === '1password') {
    return [
      'OP_SERVICE_ACCOUNT_TOKEN',
      'OP_CONNECT_HOST',
      'OP_CONNECT_TOKEN',
      'OP_ACCOUNT',
      ...Object.keys(process.env).filter((key) => /^OP_SESSION_[A-Za-z0-9_]+$/.test(key)),
    ];
  }
  if (backend === 'os-keychain') {
    return ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'];
  }
  return [];
}

function configuredCommsEnvRefs(config: OrchestratorConfig): string[] {
  const refs: Array<string | undefined> = [config.comms.orchestratorTokenRef];
  if (config.comms.slack.enabled) {
    refs.push(config.comms.slack.botTokenRef, config.comms.slack.signingSecretRef);
  }
  if (config.comms.discord.enabled) {
    const publicKeyRef = config.comms.discord.publicKeyRef;
    refs.push(
      config.comms.discord.botTokenRef,
      publicKeyRef && !/^[a-f0-9]{64}$/i.test(publicKeyRef.trim()) ? publicKeyRef : undefined,
    );
  }
  if (config.comms.telegram.enabled) {
    refs.push(config.comms.telegram.botTokenRef, config.comms.telegram.webhookSecretTokenRef);
  }
  if (config.comms.whatsapp.enabled) {
    refs.push(
      config.comms.whatsapp.accessTokenRef,
      config.comms.whatsapp.phoneNumberIdRef,
      config.comms.whatsapp.appSecretRef,
      config.comms.whatsapp.verifyTokenRef,
    );
  }
  return refs.flatMap((ref) => {
    const trimmed = ref?.trim();
    return trimmed && /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) ? [trimmed] : [];
  });
}

export function inheritedNetworkServiceEnvKeys(
  serviceId: Extract<NetworkServiceId, 'beasts-daemon' | 'chat-server' | 'dashboard-web'>,
  config: OrchestratorConfig,
): string[] {
  const keys: string[] = [
    ...OPERATOR_SECRET_ENV_KEYS,
    ...CONNECTIVITY_ENV_KEYS,
    ...secretBackendEnvKeys(config.network.secureBackend),
  ];

  if (serviceId === 'beasts-daemon' || serviceId === 'chat-server') {
    keys.push(
      ...LEGACY_OPERATOR_SECRET_ENV_KEYS,
      ...PROVIDER_ENV_KEYS,
      ...GITHUB_ENV_KEYS,
      ...ORCHESTRATOR_CONFIG_ENV_KEYS,
      ...MANAGED_RUNTIME_ENV_KEYS,
      ...MODULE_ENV_KEYS,
    );
  }
  if (serviceId === 'beasts-daemon') {
    keys.push(...CAPACITY_ENV_KEYS);
  }
  if (serviceId === 'chat-server') {
    keys.push(...configuredCommsEnvRefs(config));
  }
  if (serviceId === 'dashboard-web') {
    keys.push(...DASHBOARD_BUILD_ENV_KEYS);
  }

  return [...new Set(keys)];
}
