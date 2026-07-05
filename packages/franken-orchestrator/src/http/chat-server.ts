import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Hono } from 'hono';
import type { ILlmClient } from '@franken/types';
import { FileSessionStore, type ISessionStore } from '../chat/session-store.js';
import type { ChatSession } from '../chat/types.js';
import { createChatRuntime, type ChatRuntimeBundle } from '../chat/chat-runtime-factory.js';
import { ChatBeastDispatchAdapter } from '../chat/beast-dispatch-adapter.js';
import { BeastDaemonDispatchAdapter } from '../chat/beast-daemon-dispatch-adapter.js';
import { AgentInitService } from '../beasts/services/agent-init-service.js';
import { createChatApp } from './chat-app.js';
import { attachChatWebSocketServer } from './ws-chat-server.js';
import { createSessionTokenSecret } from './ws-chat-auth.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { BeastRoutesDeps } from './routes/beast-routes.js';
import type { CommsConfig } from '../comms/config/comms-config.js';
import type { CommsRuntimePort } from '../comms/core/comms-runtime-port.js';
import { ChatRuntimeCommsAdapter } from '../comms/core/chat-runtime-comms-adapter.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { DashboardRouteDeps } from './routes/dashboard-routes.js';
import type { AnalyticsRouteDeps } from './routes/analytics-routes.js';
import { isLoopbackHost } from '../network/network-config.js';
import { localPlaintextOrSecureEndpoint, localPlaintextOrSecureWebSocketUrl } from '../network/network-url.js';
import { closeHttpServer, handleHonoHttpRequest } from './http-server-utils.js';
import { resolveSecurityConfig, type SecurityConfig } from '../middleware/security-profiles.js';

export interface StartChatServerOptions {
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: string[];
  sessionStoreDir: string;
  sessionStore?: ISessionStore;
  llm: ILlmClient;
  executionLlm?: ILlmClient;
  projectName: string;
  sessionContinuation?: boolean;
  /** Optional dedicated chat operator token; when set, gates all /v1/chat/* routes. */
  operatorToken?: string;
  /** Test-only escape hatch for the fail-closed startup guard. */
  allowUnauthenticatedChatForTests?: boolean;
  networkControl?: {
    root: string;
    frankenbeastDir: string;
    configFile: string;
    getConfig(): OrchestratorConfig;
    setConfig(config: OrchestratorConfig): void;
  };
  beastControl?: BeastRoutesDeps;
  disposeBeastControl?: (() => void) | undefined;
  commsConfig?: CommsConfig;
  commsRuntime?: CommsRuntimePort;
  skillManager?: SkillManager;
  providerRegistry?: ProviderRegistry;
  dashboardDeps?: DashboardRouteDeps;
  analyticsDeps?: AnalyticsRouteDeps;
  beastDaemon?: { baseUrl: string; operatorToken?: string | undefined };
}

export interface ChatServerHandle {
  app: Hono;
  runtime: ChatRuntimeBundle;
  server: HttpServer;
  sessionStore: ISessionStore;
  url: string;
  wsUrl: string;
  close(): Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3737;
const DEFAULT_WS_PATH = '/v1/chat/ws';
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'stopped']);

type ChatSessionWithRouting = ChatSession & { routingMetadata?: Record<string, unknown> | undefined };

async function loadLegacyCommsSession(
  sessionStoreDir: string,
  id: string,
): Promise<(ChatSessionWithRouting & { sessionId?: string }) | null> {
  try {
    return JSON.parse(
      await readFile(join(sessionStoreDir, 'comms', `${encodeURIComponent(id)}.json`), 'utf-8'),
    ) as ChatSessionWithRouting & { sessionId?: string };
  } catch {
    return null;
  }
}

export function resolveChatServerSessionStore(options: Pick<StartChatServerOptions, 'sessionStore' | 'sessionStoreDir'>): ISessionStore {
  return options.sessionStore ?? new FileSessionStore(options.sessionStoreDir);
}

function createCommsRuntimeAdapter(
  runtime: ChatRuntimeBundle['runtime'],
  sessionStore: ISessionStore,
  sessionStoreDir: string,
  projectName: string,
): CommsRuntimePort {
  const toStoredSessionId = (id: string): string => encodeURIComponent(id);
  return new ChatRuntimeCommsAdapter(runtime, {
    load: async (id) => {
      const session = sessionStore.get(toStoredSessionId(id)) as ChatSessionWithRouting | undefined;
      if (!session) {
        const legacy = await loadLegacyCommsSession(sessionStoreDir, id);
        if (!legacy) {
          return null;
        }
        return {
          sessionId: legacy.sessionId ?? id,
          projectId: legacy.projectId,
          transcript: legacy.transcript,
          state: legacy.state,
          pendingApproval: legacy.pendingApproval ?? null,
          ...(legacy.beastContext !== undefined ? { beastContext: legacy.beastContext } : {}),
          ...(legacy.routingMetadata !== undefined ? { routingMetadata: legacy.routingMetadata } : {}),
        };
      }
      return {
        sessionId: id,
        projectId: session.projectId,
        transcript: session.transcript,
        state: session.state,
        pendingApproval: session.pendingApproval ?? null,
        ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
        ...(session.routingMetadata !== undefined ? { routingMetadata: session.routingMetadata } : {}),
      };
    },
    create: async (id, data) => {
      const now = new Date().toISOString();
      const storedId = toStoredSessionId(id);
      const session: ChatSessionWithRouting = {
        id: storedId,
        projectId: typeof data.projectId === 'string' ? data.projectId : projectName,
        transcript: Array.isArray(data.transcript) ? data.transcript as ChatSession['transcript'] : [],
        state: typeof data.state === 'string' ? data.state : 'active',
        tokenTotals: { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
        costUsd: 0,
        createdAt: now,
        updatedAt: now,
        pendingApproval: data.pendingApproval === undefined ? null : data.pendingApproval as ChatSession['pendingApproval'],
        beastContext: data.beastContext === undefined ? null : data.beastContext as ChatSession['beastContext'],
        routingMetadata: data.routingMetadata as ChatSessionWithRouting['routingMetadata'],
      };
      sessionStore.save(session);
      return {
        sessionId: id,
        projectId: session.projectId,
        transcript: session.transcript,
        state: session.state,
        pendingApproval: session.pendingApproval ?? null,
        ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
        ...(session.routingMetadata !== undefined ? { routingMetadata: session.routingMetadata } : {}),
      };
    },
    save: async (id, data) => {
      const storedId = toStoredSessionId(id);
      const existing = sessionStore.get(storedId) as ChatSessionWithRouting | undefined;
      const now = new Date().toISOString();
      const session: ChatSessionWithRouting = {
        id: storedId,
        projectId: typeof data.projectId === 'string' ? data.projectId : (existing?.projectId ?? projectName),
        transcript: Array.isArray(data.transcript) ? data.transcript as ChatSession['transcript'] : (existing?.transcript ?? []),
        state: typeof data.state === 'string' ? data.state : (existing?.state ?? 'active'),
        tokenTotals: existing?.tokenTotals ?? { cheap: 0, premiumReasoning: 0, premiumExecution: 0 },
        costUsd: existing?.costUsd ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        pendingApproval: data.pendingApproval === undefined
          ? existing?.pendingApproval ?? null
          : data.pendingApproval as ChatSession['pendingApproval'],
        beastContext: data.beastContext === undefined
          ? existing?.beastContext ?? null
          : data.beastContext as ChatSession['beastContext'],
        routingMetadata: data.routingMetadata === undefined
          ? existing?.routingMetadata
          : data.routingMetadata as ChatSessionWithRouting['routingMetadata'],
      };
      sessionStore.save(session);
    },
  });
}

function enabledSignedExternalWebhookChannels(commsConfig: CommsConfig | undefined): string[] {
  if (!commsConfig) {
    return [];
  }

  const channels = commsConfig.channels;
  const enabledChannels: string[] = [];
  if (channels.slack?.enabled && channels.slack.token && channels.slack.signingSecret) {
    enabledChannels.push('slack');
  }
  if (channels.discord?.enabled && channels.discord.token && channels.discord.publicKey) {
    enabledChannels.push('discord');
  }
  if (
    channels.whatsapp?.enabled
    && channels.whatsapp.accessToken
    && channels.whatsapp.phoneNumberId
    && channels.whatsapp.appSecret
    && channels.whatsapp.verifyToken
  ) {
    enabledChannels.push('whatsapp');
  }
  return enabledChannels;
}

export async function startChatServer(options: StartChatServerOptions): Promise<ChatServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const path = options.path ?? DEFAULT_WS_PATH;
  if (!isLoopbackHost(host)) {
    throw new Error(`Refusing to start chat-server on non-loopback host ${host}; terminate TLS in a separate reverse proxy for non-local deployments.`);
  }

  // Fail closed: refuse to expose /v1/chat/* without an operator token when
  // the server is exposed (managed-network mode OR non-loopback host).
  // Loopback-only dev without a token is intentionally allowed.
  // Enforce a single operator token across the whole surface. chat-app gates
  // chat AND the control-plane route groups (/v1/network, /api/*) behind
  // `operatorToken ?? beastControl.operatorToken`, while beast/agent routes
  // authenticate with `beastControl.operatorToken` directly. If those two
  // differ, an operator holding the beast token would pass /v1/beasts/* but get
  // 401s on the control-plane routes (and vice versa). Fail closed at startup
  // rather than ship that split-brain auth.
  const configuredTokens = [
    options.operatorToken,
    options.beastControl?.operatorToken,
    options.beastDaemon?.operatorToken,
  ].filter((token): token is string => Boolean(token));
  const uniqueTokens = new Set(configuredTokens);
  if (uniqueTokens.size > 1) {
    throw new Error(
      'Refusing to start chat-server with two different operator tokens: '
      + 'operatorToken, beastControl.operatorToken, and beastDaemon.operatorToken '
      + 'must match (the control plane uses a single operator token). Pass one '
      + 'token or make them equal.',
    );
  }
  const effectiveOperatorToken = configuredTokens[0];
  const isManaged = process.env['FRANKENBEAST_NETWORK_MANAGED'] === '1';
  const isExposed = isManaged || !isLoopbackHost(host);
  if (isExposed && !effectiveOperatorToken && !options.allowUnauthenticatedChatForTests) {
    throw new Error(
      `Refusing to start chat-server on ${host} without an operator token: `
      + 'set FRANKENBEAST_BEAST_OPERATOR_TOKEN (or pass operatorToken/beastControl) '
      + 'or bind to a loopback host. Pass allowUnauthenticatedChatForTests in tests.',
    );
  }
  const securityConfig = options.networkControl
    ? createNetworkSecurityConfigAdapter(options.networkControl)
    : undefined;
  const webhookSignaturePolicy = securityConfig?.getSecurityConfig().webhookSignaturePolicy ?? 'required';
  const unsignedExternalWebhookChannels = webhookSignaturePolicy === 'local-dev-unsigned'
    ? enabledSignedExternalWebhookChannels(options.commsConfig)
    : [];
  if (isExposed && unsignedExternalWebhookChannels.length > 0) {
    throw new Error(
      `Refusing to start chat-server on ${host} with unsigned external webhooks enabled: `
      + `${unsignedExternalWebhookChannels.join(', ')} webhooks require signature verification when the listener is exposed. `
      + 'Set security.webhookSignaturePolicy to "required" or bind to a loopback-only local-dev host.',
    );
  }
  const tokenSecret = createSessionTokenSecret();
  const sessionStore = resolveChatServerSessionStore(options);
  const runtime = createChatRuntime({
    chatLlm: options.llm,
    projectName: options.projectName,
    sessionContinuation: options.sessionContinuation ?? true,
    ...(options.beastControl
      ? {
          beastDispatchAdapter: new ChatBeastDispatchAdapter({
            catalog: options.beastControl.catalog,
            interviews: options.beastControl.interviews,
            dispatch: options.beastControl.dispatch,
            agentInit: new AgentInitService(options.beastControl.agents, options.beastControl.dispatch),
          }),
        }
      : options.beastDaemon && effectiveOperatorToken
        ? {
            beastDispatchAdapter: new BeastDaemonDispatchAdapter({
              baseUrl: options.beastDaemon.baseUrl,
              operatorToken: effectiveOperatorToken,
            }),
          }
        : {}),
    ...(options.executionLlm ? { executionLlm: options.executionLlm } : {}),
  });
  const commsRuntime = options.commsRuntime
    ?? (options.commsConfig
      ? createCommsRuntimeAdapter(runtime.runtime, sessionStore, options.sessionStoreDir, options.projectName)
      : undefined);
  const app = createChatApp({
    sessionStore,
    engine: runtime.engine,
    runtime: runtime.runtime,
    turnRunner: runtime.turnRunner,
    sessionTokenSecret: tokenSecret,
    ...(options.operatorToken ? { operatorToken: options.operatorToken } : {}),
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
    ...(options.beastControl ? { beastControl: options.beastControl } : {}),
    ...(options.networkControl ? { networkControl: options.networkControl } : {}),
    ...(securityConfig ? { securityConfig } : {}),
    ...(options.commsConfig ? { commsConfig: options.commsConfig } : {}),
    ...(commsRuntime ? { commsRuntime } : {}),
    ...(options.skillManager ? { skillManager: options.skillManager } : {}),
    ...(options.providerRegistry ? { providerRegistry: options.providerRegistry } : {}),
    ...(options.dashboardDeps ? { dashboardDeps: options.dashboardDeps } : {}),
    ...(options.analyticsDeps ? { analyticsDeps: options.analyticsDeps } : {}),
    ...(options.beastDaemon ? { beastDaemon: options.beastDaemon } : {}),
  });
  const server = createServer((request, response) => {
    void handleHonoHttpRequest(app, request, response);
  });

  attachChatWebSocketServer({
    server,
    path,
    runtime: runtime.runtime,
    sessionStore,
    tokenSecret,
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Chat server did not bind to a TCP address');
  }

  const url = localPlaintextOrSecureEndpoint(host, address.port);
  const wsUrl = localPlaintextOrSecureWebSocketUrl(host, address.port, path);

  return {
    app,
    runtime,
    server,
    sessionStore,
    url,
    wsUrl,
    close: async () => {
      await stopLiveBeastControlRuns(options.beastControl);
      options.beastControl?.ticketStore.destroy();
      options.disposeBeastControl?.();
      options.analyticsDeps?.analytics.close?.();
      const closedServer = closeHttpServer(server);
      server.closeAllConnections();
      await closedServer;
    },
  };
}

function createNetworkSecurityConfigAdapter(networkControl: NonNullable<StartChatServerOptions['networkControl']>): {
  getSecurityConfig: () => SecurityConfig;
  setSecurityConfig: (config: Partial<SecurityConfig>) => void;
} {
  return {
    getSecurityConfig: () => {
      const security = networkControl.getConfig().security;
      const overrides: Partial<Omit<SecurityConfig, 'profile'>> = {};
      if (security?.injectionDetection !== undefined) overrides.injectionDetection = security.injectionDetection;
      if (security?.piiMasking !== undefined) overrides.piiMasking = security.piiMasking;
      if (security?.outputValidation !== undefined) overrides.outputValidation = security.outputValidation;
      if (security?.webhookSignaturePolicy !== undefined) {
        overrides.webhookSignaturePolicy = security.webhookSignaturePolicy;
      }
      if (security?.allowedDomains !== undefined) overrides.allowedDomains = security.allowedDomains;
      if (security?.maxTokenBudget !== undefined) overrides.maxTokenBudget = security.maxTokenBudget;
      if (security?.requireApproval !== undefined) overrides.requireApproval = security.requireApproval;
      if (security?.customRules !== undefined) overrides.customRules = security.customRules;
      return resolveSecurityConfig(security?.profile ?? 'standard', overrides);
    },
    setSecurityConfig: (config) => {
      const current = networkControl.getConfig();
      const next = {
        ...current,
        security: {
          ...current.security,
          ...config,
        },
      };
      networkControl.setConfig(next);
      mkdirSync(dirname(networkControl.configFile), { recursive: true });
      writeFileSync(networkControl.configFile, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    },
  };
}

async function stopLiveBeastControlRuns(beastControl: BeastRoutesDeps | undefined): Promise<void> {
  if (!beastControl) {
    return;
  }
  for (const run of beastControl.runs.listRuns()) {
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      continue;
    }
    try {
      await beastControl.runs.stop(run.id, 'chat-server-shutdown');
    } catch {
      try {
        await beastControl.runs.kill(run.id, 'chat-server-shutdown');
      } catch {
        // Continue best-effort shutdown for remaining local Beast runs.
      }
    }
  }
}
