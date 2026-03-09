import { Hono } from 'hono';
import type { ILlmClient } from '@franken/types';
import { FileSessionStore } from '../chat/session-store.js';
import { ConversationEngine } from '../chat/conversation-engine.js';
import { TurnRunner } from '../chat/turn-runner.js';
import { ChatAgentExecutor } from '../chat/chat-agent-executor.js';
import { chatRoutes } from './routes/chat-routes.js';
import { errorHandler, requestId, requestSizeLimit } from './middleware.js';
import { createSessionTokenSecret, issueSessionToken } from './ws-chat-auth.js';

export interface ChatAppOptions {
  sessionStoreDir: string;
  llm: ILlmClient;
  executionLlm?: ILlmClient;
  projectName: string;
  sessionContinuation?: boolean;
  sessionTokenSecret?: string;
  turnRunner?: TurnRunner;
}

const DEFAULT_MAX_BODY_SIZE = 16 * 1024;

export function createChatApp(opts: ChatAppOptions): Hono {
  const sessionStore = new FileSessionStore(opts.sessionStoreDir);
  const engine = new ConversationEngine({
    llm: opts.llm,
    projectName: opts.projectName,
    ...(opts.sessionContinuation !== undefined
      ? { sessionContinuation: opts.sessionContinuation }
      : {}),
  });
  const turnRunner = opts.turnRunner ?? new TurnRunner(new ChatAgentExecutor({
    llm: opts.executionLlm ?? opts.llm,
  }));
  const sessionTokenSecret = opts.sessionTokenSecret ?? createSessionTokenSecret();

  const app = new Hono();
  app.use('*', requestId);
  app.use('/v1/chat/*', requestSizeLimit(DEFAULT_MAX_BODY_SIZE));
  app.onError(errorHandler);

  const routes = chatRoutes({
    sessionStore,
    engine,
    turnRunner,
    issueSocketToken: (sessionId) => issueSessionToken({
      secret: sessionTokenSecret,
      sessionId,
    }),
  });
  app.route('/', routes);

  return app;
}
