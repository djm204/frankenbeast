import { Hono } from 'hono';
import type { ILlmClient } from '@franken/types';
import { FileSessionStore } from '../chat/session-store.js';
import { ConversationEngine } from '../chat/conversation-engine.js';
import { chatRoutes } from './routes/chat-routes.js';
import { errorHandler } from './middleware.js';

export interface ChatAppOptions {
  sessionStoreDir: string;
  llm: ILlmClient;
  projectName: string;
}

export function createChatApp(opts: ChatAppOptions): Hono {
  const sessionStore = new FileSessionStore(opts.sessionStoreDir);
  const engine = new ConversationEngine({
    llm: opts.llm,
    projectName: opts.projectName,
  });

  const app = new Hono();
  app.use('*', errorHandler);

  const routes = chatRoutes({ sessionStore, engine });
  app.route('/', routes);

  return app;
}
