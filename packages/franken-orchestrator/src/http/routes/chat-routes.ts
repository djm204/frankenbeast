import { Hono } from 'hono';
import { z } from 'zod';
import { approvalRuntimeInput } from '../../chat/approval-input.js';
import type { ISessionStore } from '../../chat/session-store.js';
import type { ConversationEngine } from '../../chat/conversation-engine.js';
import type { ChatRuntime } from '../../chat/runtime.js';
import type { TurnRunner } from '../../chat/turn-runner.js';
import type {
  ApiDataEnvelope,
  ApproveResult,
  ChatSessionResponse,
  ChatSessionSummary,
  MessageResult,
  TurnOutcome,
} from '@franken/types';
import { HttpError, parseJsonBody, validateBody } from '../middleware.js';
import { createSseHandler } from '../sse.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';

const CreateSessionBody = z.object({
  projectId: z.string().min(1),
}).strict();

const SubmitMessageBody = z.object({
  content: z.string().min(1),
  executionMode: z.enum(['process', 'container']).optional(),
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
  operatorToken?: string | undefined;
  streamTicketStore?: SseConnectionTicketStore | undefined;
}

function getSessionOrThrow(store: ISessionStore, id: string) {
  const session = store.get(id);
  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', `Session '${id}' not found`);
  }
  return session;
}

function sessionResponse(
  session: NonNullable<ReturnType<ISessionStore['get']>>,
  socketToken: string,
): ChatSessionResponse {
  return { ...session, socketToken };
}

export function chatRoutes(deps: ChatRoutesDeps): Hono {
  const { sessionStore, runtime, turnRunner, issueSocketToken, operatorToken, streamTicketStore } = deps;
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
    const response = {
      data: sessionResponse(session, issueSocketToken(session.id)),
    } satisfies ApiDataEnvelope<ChatSessionResponse>;
    return c.json(response, 201);
  });

  app.get('/v1/chat/sessions', (c) => {
    const projectId = c.req.query('projectId');
    const sessions: ChatSessionSummary[] = sessionStore.listSessions(projectId).map((session) => ({
      id: session.id,
      projectId: session.projectId,
      state: session.state,
      messageCount: session.transcript.length,
      preview: [...session.transcript].reverse().find((message) => message.role !== 'system')?.content ?? '',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
    return c.json({ data: { sessions } } satisfies ApiDataEnvelope<{ sessions: ChatSessionSummary[] }>);
  });

  // Get session
  app.get('/v1/chat/sessions/:id', (c) => {
    const id = c.req.param('id');
    const session = getSessionOrThrow(sessionStore, id);
    return c.json({
      data: sessionResponse(session, issueSocketToken(session.id)),
    } satisfies ApiDataEnvelope<ChatSessionResponse>);
  });

  // Submit message
  app.post('/v1/chat/sessions/:id/messages', async (c) => {
    const id = c.req.param('id');
    const body = await parseJsonBody(c);
    const { content, executionMode } = validateBody(SubmitMessageBody, body);
    const session = getSessionOrThrow(sessionStore, id);

    const result = await runtime.run(content, {
      sessionId: session.id,
      pendingApproval: Boolean(session.pendingApproval),
      projectId: session.projectId,
      transcript: session.transcript,
      ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
      ...(executionMode ? { executionMode } : {}),
    });

    session.transcript = result.transcript;
    session.state = result.state;
    session.pendingApproval = result.pendingApproval && result.pendingApprovalDescription
      ? {
          description: result.pendingApprovalDescription,
          requestedAt: new Date().toISOString(),
          ...result.pendingApprovalContext,
        }
      : null;
    session.beastContext = result.beastContext ?? null;
    session.updatedAt = new Date().toISOString();
    sessionStore.save(session);

    const outcome: TurnOutcome = result.outcome ?? {
      kind: 'reply',
      content: result.displayMessages.map((message) => message.content).join('\n'),
      modelTier: result.tier ?? 'unknown',
    };

    const response = {
      data: {
        outcome,
        tier: result.tier ?? 'unknown',
        state: session.state,
      },
    } satisfies ApiDataEnvelope<MessageResult>;
    return c.json(response);
  });

  // Browser EventSource cannot attach Authorization headers. Authenticated
  // callers mint a short-lived, one-shot ticket with normal fetch credentials,
  // then place only that ticket in the stream URL.
  app.post('/v1/chat/sessions/:id/stream/ticket', (c) => {
    const id = c.req.param('id');
    getSessionOrThrow(sessionStore, id);
    if (!operatorToken) {
      return c.json({ ticket: null });
    }
    if (!streamTicketStore) {
      return c.json({ error: { code: 'UNAVAILABLE', message: 'Chat stream tickets are not configured' } }, 503);
    }
    return c.json({ ticket: streamTicketStore.issue(operatorToken, id) });
  });

  // SSE stream
  app.get('/v1/chat/sessions/:id/stream', createSseHandler({
    sessionStore,
    turnRunner,
    operatorToken,
    ticketStore: streamTicketStore,
  }));

  // Approve action
  app.post('/v1/chat/sessions/:id/approve', async (c) => {
    const id = c.req.param('id');
    const body = await parseJsonBody(c);
    const { approved } = validateBody(ApproveBody, body);
    const session = getSessionOrThrow(sessionStore, id);

    if (!session.pendingApproval && session.state !== 'pending_approval') {
      return c.json({ data: { id: session.id, approved, state: session.state } });
    }

    if (approved) {
      const pendingApproval = session.pendingApproval ?? null;
      const wasPendingApproval = Boolean(pendingApproval) || session.state === 'pending_approval';
      const runtimeInput = approvalRuntimeInput(pendingApproval);
      session.pendingApproval = null;
      session.state = 'approved';
      session.updatedAt = new Date().toISOString();
      sessionStore.save(session);

      const result = await runtime.run(runtimeInput, {
        sessionId: session.id,
        pendingApproval: wasPendingApproval,
        projectId: session.projectId,
        transcript: session.transcript,
        ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
      });

      session.state = result.state === 'active' ? 'approved' : result.state;
      session.pendingApproval = null;
      session.beastContext = result.beastContext ?? null;
    } else {
      session.state = 'rejected';
      session.pendingApproval = null;
    }
    session.updatedAt = new Date().toISOString();
    sessionStore.save(session);

    return c.json({ data: { id: session.id, approved, state: session.state } } satisfies ApiDataEnvelope<ApproveResult>);
  });

  return app;
}
