import { Hono } from 'hono';
import type { ILlmClient } from '@franken/types';
import { FileSessionStore } from '../chat/session-store.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { ConversationEngine } from '../chat/conversation-engine.js';
import type { TurnRunner } from '../chat/turn-runner.js';
import type { ChatRuntime } from '../chat/runtime.js';
import { createChatRuntime } from '../chat/chat-runtime-factory.js';
import { agentRoutes } from './routes/agent-routes.js';
import { AgentInitService } from '../beasts/services/agent-init-service.js';
import { createBeastSseRoutes } from './routes/beast-sse-routes.js';
import { beastRoutes, type BeastRoutesDeps } from './routes/beast-routes.js';
import { chatRoutes } from './routes/chat-routes.js';
import { networkRoutes } from './routes/network-routes.js';
import { commsRoutes } from './routes/comms-routes.js';
import { createSecurityRoutes } from './routes/security-routes.js';
import type { SecurityConfig } from '../middleware/security-profiles.js';
import { errorHandler, requestId, requestSizeLimit } from './middleware.js';
import { createSessionTokenSecret, issueSessionToken } from './ws-chat-auth.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { TransportSecurityService } from './security/transport-security.js';
import { ChatBeastDispatchAdapter } from '../chat/beast-dispatch-adapter.js';
import type { CommsConfig } from '../comms/config/comms-config.js';
import type { CommsRuntimePort } from '../comms/core/comms-runtime-port.js';

export interface ChatAppOptions {
  sessionStoreDir?: string;
  sessionStore?: ISessionStore;
  llm?: ILlmClient;
  executionLlm?: ILlmClient;
  projectName?: string;
  sessionContinuation?: boolean;
  sessionTokenSecret?: string;
  engine?: ConversationEngine;
  runtime?: ChatRuntime;
  turnRunner?: TurnRunner;
  transportSecurity?: TransportSecurityService;
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
  securityConfig?: {
    getSecurityConfig: () => SecurityConfig;
    setSecurityConfig: (config: Partial<SecurityConfig>) => void;
  };
}

const DEFAULT_MAX_BODY_SIZE = 16 * 1024;

export function createChatApp(opts: ChatAppOptions): Hono {
  const sessionStore = opts.sessionStore
    ?? new FileSessionStore(required(opts.sessionStoreDir, 'sessionStoreDir'));
  const runtimeBundle = (opts.engine && opts.runtime && opts.turnRunner)
    ? {
        engine: opts.engine,
        runtime: opts.runtime,
        turnRunner: opts.turnRunner,
      }
    : createChatRuntime({
        chatLlm: required(opts.llm, 'llm'),
        projectName: required(opts.projectName, 'projectName'),
        ...(opts.beastControl
          ? {
              beastDispatchAdapter: new ChatBeastDispatchAdapter({
                catalog: opts.beastControl.catalog,
                interviews: opts.beastControl.interviews,
                dispatch: opts.beastControl.dispatch,
                agentInit: new AgentInitService(opts.beastControl.agents, opts.beastControl.dispatch),
              }),
            }
          : {}),
        ...(opts.executionLlm ? { executionLlm: opts.executionLlm } : {}),
        ...(opts.sessionContinuation !== undefined
          ? { sessionContinuation: opts.sessionContinuation }
          : {}),
        ...(opts.turnRunner ? { turnRunner: opts.turnRunner } : {}),
      });
  const sessionTokenSecret = opts.sessionTokenSecret ?? createSessionTokenSecret();
  const transportSecurity = opts.transportSecurity ?? new TransportSecurityService();

  const app = new Hono();
  app.use('*', requestId);
  app.use('/v1/chat/*', requestSizeLimit(DEFAULT_MAX_BODY_SIZE));
  app.onError(errorHandler);

  const routes = chatRoutes({
    sessionStore,
    engine: runtimeBundle.engine,
    runtime: runtimeBundle.runtime,
    turnRunner: runtimeBundle.turnRunner,
    issueSocketToken: (sessionId) => issueSessionToken({
      secret: sessionTokenSecret,
      sessionId,
    }),
  });
  app.route('/', routes);
  if (opts.beastControl) {
    app.route('/', beastRoutes({
      ...opts.beastControl,
      security: opts.beastControl.security ?? transportSecurity,
    }));
    app.route('/', agentRoutes({
      agents: opts.beastControl.agents,
      dispatch: opts.beastControl.dispatch,
      runs: opts.beastControl.runs,
      operatorToken: opts.beastControl.operatorToken,
      security: opts.beastControl.security ?? transportSecurity,
      rateLimit: opts.beastControl.rateLimit,
    }));
    const bc = opts.beastControl;
    app.route('/', createBeastSseRoutes({
      bus: bc.eventBus,
      ticketStore: bc.ticketStore,
      operatorToken: bc.operatorToken,
      getSnapshot: () => ({
        agents: bc.agents.listAgents().map((a) => ({
          id: a.id,
          definitionId: a.definitionId,
          status: a.status,
          updatedAt: a.updatedAt,
        })),
      }),
    }));
  }
  if (opts.networkControl) {
    app.route('/', networkRoutes(opts.networkControl));
  }
  if (opts.commsConfig && opts.commsRuntime) {
    const commsRoutesOpts: Parameters<typeof commsRoutes>[0] = {
      config: opts.commsConfig,
      runtime: opts.commsRuntime,
    };
    if (opts.securityConfig) {
      commsRoutesOpts.securityProfile = opts.securityConfig.getSecurityConfig().profile;
    }
    app.route('/', commsRoutes(commsRoutesOpts));
  }
  if (opts.securityConfig) {
    app.route('/api/security', createSecurityRoutes(opts.securityConfig));
  }

  return app;
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`createChatApp requires '${field}' when shared runtime dependencies are not provided`);
  }
  return value;
}
