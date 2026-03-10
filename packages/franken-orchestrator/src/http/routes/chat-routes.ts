import { Hono } from 'hono';
import { z } from 'zod';
import type { ISessionStore } from '../../chat/session-store.js';
import type { ConversationEngine } from '../../chat/conversation-engine.js';
import type { ChatRuntime } from '../../chat/runtime.js';
import type { TurnRunner, TurnRunResult } from '../../chat/turn-runner.js';
import { HttpError, parseJsonBody, validateBody } from '../middleware.js';
import { createSseHandler } from '../sse.js';

const CreateSessionBody = z.object({
  projectId: z.string().min(1),
}).strict();

const SubmitMessageBody = z.object({
  content: z.string().min(1),
}).strict();

const ApproveBody = z.object({
  approved: z.boolean(),
}).strict();

export interface ChatRoutesDeps {
  sessionStore: ISessionStore;
  engine: ConversationEngine;
  runtime: ChatRuntime;
  turnRunner: TurnRunner;
  issueSocketToken: (sessionId: string) => string;
}

function getSessionOrThrow(store: ISessionStore, id: string) {
  const session = store.get(id);
  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', `Session '${id}' not found`);
  }
  return session;
}

function sessionStateFromRunStatus(status: TurnRunResult['status']): string {
  switch (status) {
    case 'pending_approval':
      return 'pending_approval';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'active';
  }
}

export function chatRoutes(deps: ChatRoutesDeps): Hono {
  const { sessionStore, runtime, turnRunner, issueSocketToken } = deps;
  const app = new Hono();

  // Health check
  app.get('/health', (c) => {
    c.header('x-frankenbeast-service', 'chat-server');
    return c.json({ status: 'ok', service: 'chat-server' });
  });

  // Create session
  app.post('/v1/chat/sessions', async (c) => {
    const body = await parseJsonBody(c);
    const { projectId } = validateBody(CreateSessionBody, body);
    const session = sessionStore.create(projectId);
    return c.json({ data: { ...session, socketToken: issueSocketToken(session.id) } }, 201);
  });

  // Get session
  app.get('/v1/chat/sessions/:id', (c) => {
    const id = c.req.param('id');
    const session = getSessionOrThrow(sessionStore, id);
    return c.json({ data: { ...session, socketToken: issueSocketToken(session.id) } });
  });

  // Submit message
  app.post('/v1/chat/sessions/:id/messages', async (c) => {
    const id = c.req.param('id');
    const body = await parseJsonBody(c);
    const { content } = validateBody(SubmitMessageBody, body);
    const session = getSessionOrThrow(sessionStore, id);

    const result = await runtime.run(content, {
      sessionId: session.id,
      pendingApproval: Boolean(session.pendingApproval),
      projectId: session.projectId,
      transcript: session.transcript,
      ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
    });

    session.transcript = result.transcript;
    session.state = result.state;
    session.pendingApproval = result.pendingApproval && result.pendingApprovalDescription
      ? { description: result.pendingApprovalDescription, requestedAt: new Date().toISOString() }
      : null;
    session.beastContext = result.beastContext ?? null;
    session.updatedAt = new Date().toISOString();
    sessionStore.save(session);

    return c.json({
      data: {
        outcome: result.outcome,
        tier: result.tier,
        state: session.state,
      },
    });
  });

  // SSE stream
  app.get('/v1/chat/sessions/:id/stream', createSseHandler({ sessionStore, turnRunner }));

  // Approve action
  app.post('/v1/chat/sessions/:id/approve', async (c) => {
    const id = c.req.param('id');
    const body = await parseJsonBody(c);
    const { approved } = validateBody(ApproveBody, body);
    const session = getSessionOrThrow(sessionStore, id);

    session.state = approved ? 'approved' : 'rejected';
    session.updatedAt = new Date().toISOString();
    sessionStore.save(session);

    return c.json({ data: { id: session.id, approved, state: session.state } });
  });

  return app;
}
