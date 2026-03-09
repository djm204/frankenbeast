import { Hono } from 'hono';
import { z } from 'zod';
import type { ISessionStore } from '../../chat/session-store.js';
import type { ConversationEngine } from '../../chat/conversation-engine.js';
import { HttpError, validateBody } from '../middleware.js';

const CreateSessionBody = z.object({
  projectId: z.string(),
}).strict();

const SubmitMessageBody = z.object({
  content: z.string(),
}).strict();

const ApproveBody = z.object({
  approved: z.boolean(),
}).strict();

export interface ChatRoutesDeps {
  sessionStore: ISessionStore;
  engine: ConversationEngine;
}

function getSessionOrThrow(store: ISessionStore, id: string) {
  const session = store.get(id);
  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', `Session '${id}' not found`);
  }
  return session;
}

export function chatRoutes(deps: ChatRoutesDeps): Hono {
  const { sessionStore, engine } = deps;
  const app = new Hono();

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Create session
  app.post('/v1/chat/sessions', async (c) => {
    const body = await c.req.json();
    const { projectId } = validateBody(CreateSessionBody, body);
    const session = sessionStore.create(projectId);
    return c.json({ data: session }, 201);
  });

  // Get session
  app.get('/v1/chat/sessions/:id', (c) => {
    const id = c.req.param('id');
    const session = getSessionOrThrow(sessionStore, id);
    return c.json({ data: session });
  });

  // Submit message
  app.post('/v1/chat/sessions/:id/messages', async (c) => {
    const id = c.req.param('id');
    const session = getSessionOrThrow(sessionStore, id);
    const body = await c.req.json();
    const { content } = validateBody(SubmitMessageBody, body);

    const result = await engine.processTurn(content, session.transcript);

    // Update session transcript and save
    session.transcript.push(...result.newMessages);
    session.updatedAt = new Date().toISOString();
    sessionStore.save(session);

    return c.json({
      data: {
        outcome: result.outcome,
        tier: result.tier,
        newMessages: result.newMessages,
      },
    });
  });

  // Approve action
  app.post('/v1/chat/sessions/:id/approve', async (c) => {
    const id = c.req.param('id');
    const session = getSessionOrThrow(sessionStore, id);
    const body = await c.req.json();
    const { approved } = validateBody(ApproveBody, body);

    session.state = approved ? 'approved' : 'rejected';
    session.updatedAt = new Date().toISOString();
    sessionStore.save(session);

    return c.json({ data: { id: session.id, state: session.state } });
  });

  return app;
}
