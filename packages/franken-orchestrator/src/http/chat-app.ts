import { Hono } from 'hono';
import type { ILlmClient } from '@franken/core';
import { FileSessionStore } from '../chat/session-store.js';
import type { ISessionStore } from '../chat/session-store.js';
import type { ConversationEngine } from '../chat/conversation-engine.js';
import type { TurnRunner } from '../chat/turn-runner.js';
import type { ChatRuntime } from '../chat/runtime.js';
import { createChatRuntime } from '../chat/chat-runtime-factory.js';
import { chatRoutes } from './routes/chat-routes.js';
import { networkRoutes } from './routes/network-routes.js';
import { errorHandler, requestId, requestSizeLimit } from './middleware.js';
import { createSessionTokenSecret, issueSessionToken } from './ws-chat-auth.js';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';

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
  networkControl?: {
    root: string;
    frankenbeastDir: string;
    configFile: string;
    getConfig(): OrchestratorConfig;
    setConfig(config: OrchestratorConfig): void;
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
        ...(opts.executionLlm ? { executionLlm: opts.executionLlm } : {}),
        ...(opts.sessionContinuation !== undefined
          ? { sessionContinuation: opts.sessionContinuation }
          : {}),
        ...(opts.turnRunner ? { turnRunner: opts.turnRunner } : {}),
      });
  const sessionTokenSecret = opts.sessionTokenSecret ?? createSessionTokenSecret();

  const app = new Hono();
  app.use('*', requestId);
  app.use('/v1/chat/*', requestSizeLimit(DEFAULT_MAX_BODY_SIZE));
  app.onError(errorHandler);

  const routes = chatRoutes({
    sessionStore,
    engine: runtimeBundle.engine,
    turnRunner: runtimeBundle.turnRunner,
    issueSocketToken: (sessionId) => issueSessionToken({
      secret: sessionTokenSecret,
      sessionId,
    }),
  });
  app.route('/', routes);
  if (opts.networkControl) {
    app.route('/', networkRoutes(opts.networkControl));
  }

  return app;
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`createChatApp requires '${field}' when shared runtime dependencies are not provided`);
  }
  return value;
}
