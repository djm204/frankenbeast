import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Hono } from 'hono';
import type { ILlmClient } from '@franken/types';
import { FileSessionStore, type ISessionStore } from '../chat/session-store.js';
import { createChatRuntime, type ChatRuntimeBundle } from '../chat/chat-runtime-factory.js';
import { ChatBeastDispatchAdapter } from '../chat/beast-dispatch-adapter.js';
import { AgentInitService } from '../beasts/services/agent-init-service.js';
import { createChatApp } from './chat-app.js';
import { attachChatWebSocketServer } from './ws-chat-server.js';
import { createSessionTokenSecret } from './ws-chat-auth.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import type { BeastRoutesDeps } from './routes/beast-routes.js';
import type { CommsConfig } from '../comms/config/comms-config.js';
import type { CommsRuntimePort } from '../comms/core/comms-runtime-port.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { DashboardRouteDeps } from './routes/dashboard-routes.js';
import type { AnalyticsRouteDeps } from './routes/analytics-routes.js';
import { closeHttpServer, handleHonoHttpRequest } from './http-server-utils.js';

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

export function resolveChatServerSessionStore(options: Pick<StartChatServerOptions, 'sessionStore' | 'sessionStoreDir'>): ISessionStore {
  return options.sessionStore ?? new FileSessionStore(options.sessionStoreDir);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export async function startChatServer(options: StartChatServerOptions): Promise<ChatServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const path = options.path ?? DEFAULT_WS_PATH;

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
  if (
    options.operatorToken
    && options.beastControl?.operatorToken
    && options.operatorToken !== options.beastControl.operatorToken
  ) {
    throw new Error(
      'Refusing to start chat-server with two different operator tokens: '
      + 'operatorToken and beastControl.operatorToken must match (the control '
      + 'plane uses a single operator token). Pass one token or make them equal.',
    );
  }
  const effectiveOperatorToken = options.operatorToken ?? options.beastControl?.operatorToken;
  const isManaged = process.env['FRANKENBEAST_NETWORK_MANAGED'] === '1';
  const isExposed = isManaged || !LOOPBACK_HOSTS.has(host);
  if (isExposed && !effectiveOperatorToken && !options.allowUnauthenticatedChatForTests) {
    throw new Error(
      `Refusing to start chat-server on ${host} without an operator token: `
      + 'set FRANKENBEAST_BEAST_OPERATOR_TOKEN (or pass operatorToken/beastControl) '
      + 'or bind to a loopback host. Pass allowUnauthenticatedChatForTests in tests.',
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
      : {}),
    ...(options.executionLlm ? { executionLlm: options.executionLlm } : {}),
  });
  const app = createChatApp({
    sessionStore,
    engine: runtime.engine,
    runtime: runtime.runtime,
    turnRunner: runtime.turnRunner,
    sessionTokenSecret: tokenSecret,
    ...(options.operatorToken ? { operatorToken: options.operatorToken } : {}),
    ...(options.beastControl ? { beastControl: options.beastControl } : {}),
    ...(options.networkControl ? { networkControl: options.networkControl } : {}),
    ...(options.commsConfig ? { commsConfig: options.commsConfig } : {}),
    ...(options.commsRuntime ? { commsRuntime: options.commsRuntime } : {}),
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

  const url = `http://${host}:${address.port}`;
  const wsUrl = `ws://${host}:${address.port}${path}`;

  return {
    app,
    runtime,
    server,
    sessionStore,
    url,
    wsUrl,
    close: async () => {
      options.beastControl?.ticketStore.destroy();
      await closeHttpServer(server);
    },
  };
}
