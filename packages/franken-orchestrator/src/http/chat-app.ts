import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
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
import { CHAT_SOCKET_TOKEN_TTL_MS, createSessionTokenSecret, issueSessionToken } from './ws-chat-auth.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { TransportSecurityService } from './security/transport-security.js';
import { requireOperatorAuth } from './operator-auth.js';
import { ChatBeastDispatchAdapter } from '../chat/beast-dispatch-adapter.js';
import type { CommsConfig } from '../comms/config/comms-config.js';
import type { CommsRuntimePort } from '../comms/core/comms-runtime-port.js';
import type { SkillManager } from '../skills/skill-manager.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import { createSkillRoutes } from './routes/skill-routes.js';
import { createDashboardRoutes, type DashboardRouteDeps } from './routes/dashboard-routes.js';
import { SseConnectionTicketStore } from '../beasts/events/sse-connection-ticket.js';
import { createAnalyticsRoutes, type AnalyticsRouteDeps } from './routes/analytics-routes.js';

export interface ChatAppOptions {
  sessionStoreDir?: string;
  sessionStore?: ISessionStore;
  llm?: ILlmClient;
  executionLlm?: ILlmClient;
  projectName?: string;
  sessionContinuation?: boolean;
  sessionTokenSecret?: string;
  operatorToken?: string;
  allowedOrigins?: string[];
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
  skillManager?: SkillManager;
  providerRegistry?: ProviderRegistry;
  /** Dashboard aggregation. Requires skillManager and securityConfig for mutation endpoints. */
  dashboardDeps?: DashboardRouteDeps;
  /** Read-only observer/governor/cost analytics aggregation. */
  analyticsDeps?: AnalyticsRouteDeps;
  /** Optional owner-managed ticket store for browser EventSource chat streams. */
  chatStreamTicketStore?: SseConnectionTicketStore;
  /** Optional gateway compatibility proxy for /v1/beasts/* now owned by beasts-daemon. */
  beastDaemon?: { baseUrl: string; operatorToken?: string | undefined };
}

const DEFAULT_MAX_BODY_SIZE = 16 * 1024;
const CORS_ALLOW_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_ALLOW_HEADERS = ['authorization', 'content-type', 'x-frankenbeast-operator-token'];

// Hono's CORS middleware emits Access-Control-Allow-Credentials whenever the
// option is true, even if the request origin is not allowed. Instantiate it per
// request so credentialed CORS headers are only emitted for allowlisted origins.
function credentialedCorsForAllowedOrigins(allowedOrigins: Set<string>): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin') ?? '';
    const originAllowed = allowedOrigins.has(origin);
    const middleware = cors({
      origin: originAllowed ? origin : () => null,
      allowMethods: CORS_ALLOW_METHODS,
      allowHeaders: CORS_ALLOW_HEADERS,
      credentials: originAllowed,
      maxAge: 600,
    });
    return middleware(c, next);
  };
}

function isChatSessionStreamPath(pathname: string): boolean {
  return /^\/v1\/chat\/sessions\/[^/]+\/stream$/.test(pathname);
}

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
  const effectiveOperatorToken = opts.operatorToken ?? opts.beastControl?.operatorToken ?? opts.beastDaemon?.operatorToken;
  const chatStreamTicketStore = opts.chatStreamTicketStore ?? (effectiveOperatorToken ? new SseConnectionTicketStore() : undefined);

  const app = new Hono();
  app.use('*', requestId);
  if (opts.allowedOrigins && opts.allowedOrigins.length > 0) {
    const allowedOrigins = new Set(opts.allowedOrigins.filter((origin) => origin !== '*'));
    if (allowedOrigins.size > 0) {
      app.use('*', credentialedCorsForAllowedOrigins(allowedOrigins));
    }
  }
  for (const base of ['/v1/chat', '/v1/network', '/api/skills']) {
    app.use(base, requestSizeLimit(DEFAULT_MAX_BODY_SIZE));
    app.use(`${base}/*`, requestSizeLimit(DEFAULT_MAX_BODY_SIZE));
  }
  // Chat /v1/chat/* is gated by an operator token whenever one is configured.
  // The same operator token authorizes the beast control plane and chat in
  // this codebase (matching the existing `VITE_BEAST_OPERATOR_TOKEN` pattern
  // already used by franken-web for beast routes); first-party clients
  // (franken-web ChatApiClient, network/chat-attach) plumb the token through.
  // `startChatServer` separately fails closed when chat is exposed without a
  // token (managed mode or non-loopback host).
  const operatorSecurity = opts.beastControl?.security ?? transportSecurity;
  // Gate the chat plane and every sensitive control-plane route group behind the
  // same operator token whenever one is configured. Each group mutates process
  // state, security config, skills, or exposes operational/analytics data, so it
  // shares the chat trust boundary. Registered before the routes are mounted so
  // the middleware runs ahead of the handlers (Hono matches in registration
  // order). The generic comms ingress (`/v1/comms/inbound`, `/v1/comms/action`)
  // is included here; provider webhook routes (`/webhooks/*`) keep their own
  // per-channel signature verification and the public `/comms/health` probe is
  // intentionally left open. `startChatServer` separately fails closed when an
  // exposed server has no operator token configured.
  if (effectiveOperatorToken) {
    const requireAuth = () => requireOperatorAuth({
      operatorToken: effectiveOperatorToken,
      security: operatorSecurity,
    });
    // Register both the exact base path and the wildcard: Hono's `/base/*` does
    // not match the base path itself (e.g. `/api/skills`), so collection roots
    // would otherwise slip past auth. This mirrors the beast/agent route guard.
    // /v1/beasts/events/stream uses one-shot SSE tickets because browser
    // EventSource cannot send Authorization headers. Protect other Beast proxy
    // routes with the shared bearer token, but let ticketed streams reach the
    // daemon where the ticket is validated.
    app.use('/v1/beasts', requireAuth());
    app.use('/v1/beasts/*', async (c, next) => {
      if (new URL(c.req.url).pathname === '/v1/beasts/events/stream') {
        await next();
        return;
      }
      return requireAuth()(c, next);
    });
    app.use('/api/dashboard', requireAuth());
    app.use('/api/dashboard/*', async (c, next) => {
      if (new URL(c.req.url).pathname === '/api/dashboard/events') {
        await next();
        return;
      }
      return requireAuth()(c, next);
    });
    app.use('/v1/chat', requireAuth());
    app.use('/v1/chat/*', async (c, next) => {
      if (isChatSessionStreamPath(new URL(c.req.url).pathname) && c.req.query('ticket')) {
        await next();
        return;
      }
      return requireAuth()(c, next);
    });
    for (const base of [
      '/v1/network',
      '/v1/comms',
      '/api/security',
      '/api/skills',
      '/api/analytics',
    ]) {
      app.use(base, requireAuth());
      app.use(`${base}/*`, requireAuth());
    }
  }
  app.onError(errorHandler);

  const routes = chatRoutes({
    sessionStore,
    engine: runtimeBundle.engine,
    runtime: runtimeBundle.runtime,
    turnRunner: runtimeBundle.turnRunner,
    operatorToken: effectiveOperatorToken,
    streamTicketStore: chatStreamTicketStore,
    issueSocketToken: (sessionId) => issueSessionToken({
      expiresInMs: CHAT_SOCKET_TOKEN_TTL_MS,
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
  } else if (opts.beastDaemon) {
    const proxyOperatorToken = opts.beastDaemon.operatorToken ?? effectiveOperatorToken;
    app.all('/v1/beasts/*', async (c) => proxyToBeastDaemon(c.req.raw, opts.beastDaemon!, proxyOperatorToken));
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
      commsRoutesOpts.getWebhookSignaturePolicy = () => opts.securityConfig!.getSecurityConfig().webhookSignaturePolicy;
    }
    app.route('/', commsRoutes(commsRoutesOpts));
  }
  if (opts.securityConfig) {
    app.route('/api/security', createSecurityRoutes(opts.securityConfig));
  }
  if (opts.skillManager && opts.providerRegistry) {
    app.route('/api/skills', createSkillRoutes({
      skillManager: opts.skillManager,
      providerRegistry: opts.providerRegistry,
    }));
  }
  if (opts.dashboardDeps) {
    app.route('/api/dashboard', createDashboardRoutes({
      ...opts.dashboardDeps,
      operatorToken: effectiveOperatorToken,
      ticketStore: opts.dashboardDeps.ticketStore ?? new SseConnectionTicketStore(),
    }));
  }
  if (opts.analyticsDeps) {
    app.route('/api/analytics', createAnalyticsRoutes(opts.analyticsDeps));
  }

  return app;
}

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const;

async function proxyToBeastDaemon(
  request: Request,
  daemon: { baseUrl: string; operatorToken?: string | undefined },
  operatorToken?: string | undefined,
): Promise<Response> {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, daemon.baseUrl);
  const headers = new Headers(request.headers);
  removeHopByHopHeaders(headers);
  if (!headers.has('authorization')) {
    const headerToken = headers.get('x-frankenbeast-operator-token')?.trim();
    const forwardedToken = operatorToken ?? (headerToken ? headerToken : undefined);
    if (forwardedToken) {
      headers.set('authorization', `Bearer ${forwardedToken}`);
    }
  }

  const method = request.method;
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body;
    Object.assign(init, { duplex: 'half' });
  }
  return fetch(targetUrl, init);
}

function removeHopByHopHeaders(headers: Headers): void {
  const connectionTokens = headers.get('connection')
    ?.split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean) ?? [];
  for (const header of [...HOP_BY_HOP_HEADERS, 'host', ...connectionTokens]) {
    headers.delete(header);
  }
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`createChatApp requires '${field}' when shared runtime dependencies are not provided`);
  }
  return value;
}
