import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
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

export async function startChatServer(options: StartChatServerOptions): Promise<ChatServerHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const path = options.path ?? DEFAULT_WS_PATH;
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
    ...(options.beastControl ? { beastControl: options.beastControl } : {}),
    ...(options.networkControl ? { networkControl: options.networkControl } : {}),
    ...(options.commsConfig ? { commsConfig: options.commsConfig } : {}),
    ...(options.commsRuntime ? { commsRuntime: options.commsRuntime } : {}),
    ...(options.skillManager ? { skillManager: options.skillManager } : {}),
    ...(options.providerRegistry ? { providerRegistry: options.providerRegistry } : {}),
    ...(options.dashboardDeps ? { dashboardDeps: options.dashboardDeps } : {}),
  });
  const server = createServer((request, response) => {
    void handleHttpRequest(app, request, response);
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
      await closeServer(server);
    },
  };
}

async function handleHttpRequest(app: Hono, request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const honoRequest = toRequest(request);
    const honoResponse = await app.fetch(honoRequest);

    response.statusCode = honoResponse.status;
    response.statusMessage = honoResponse.statusText;
    for (const [key, value] of honoResponse.headers.entries()) {
      response.setHeader(key, value);
    }

    if (!honoResponse.body) {
      response.end();
      return;
    }

    const body = Buffer.from(await honoResponse.arrayBuffer());
    response.end(body);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : 'Internal Server Error');
  }
}

function toRequest(request: IncomingMessage): Request {
  const host = request.headers.host ?? `${DEFAULT_HOST}:${DEFAULT_PORT}`;
  const url = new URL(request.url ?? '/', `http://${host}`);
  const method = request.method ?? 'GET';
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }

  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(request) as ReadableStream,
    ...( { duplex: 'half' } as { duplex: 'half' } ),
  } as RequestInit);
}

function closeServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
