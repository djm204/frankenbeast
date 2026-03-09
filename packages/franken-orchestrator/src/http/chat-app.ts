import { Hono } from 'hono';
import type { ILlmClient } from '@franken/types';
import { FileSessionStore } from '../chat/session-store.js';
import { ConversationEngine } from '../chat/conversation-engine.js';
import { TurnRunner } from '../chat/turn-runner.js';
import { chatRoutes } from './routes/chat-routes.js';
import { errorHandler, requestId, requestSizeLimit } from './middleware.js';

export interface ChatAppOptions {
  sessionStoreDir: string;
  llm: ILlmClient;
  projectName: string;
  turnRunner?: TurnRunner;
}

const DEFAULT_MAX_BODY_SIZE = 16 * 1024;

export function createChatApp(opts: ChatAppOptions): Hono {
  const sessionStore = new FileSessionStore(opts.sessionStoreDir);
  const engine = new ConversationEngine({
    llm: opts.llm,
    projectName: opts.projectName,
  });
  const executor = {
    execute: async ({ userInput }: { userInput: string }) => ({
      status: 'success' as const,
      summary: `Executed: ${userInput}`,
      filesChanged: [],
      testsRun: 0,
      errors: [],
    }),
  };
  const turnRunner = opts.turnRunner ?? new TurnRunner(executor);

  const app = new Hono();
  app.use('*', requestId);
  app.use('/v1/chat/*', requestSizeLimit(DEFAULT_MAX_BODY_SIZE));
  app.onError(errorHandler);

  const routes = chatRoutes({ sessionStore, engine, turnRunner });
  app.route('/', routes);

  return app;
}
