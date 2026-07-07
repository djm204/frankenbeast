import { createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
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
import { InMemoryRateLimiter, type BeastRateLimitOptions } from '../../beasts/http/beast-rate-limit.js';

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
  chatRateLimit: BeastRateLimitOptions;
}

type ChatMutationKind = 'message' | 'approval';

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

function firstForwardedAddress(header: string | undefined): string | undefined {
  return header?.split(',')[0]?.trim() || undefined;
}

function requestAddress(c: Context): string {
  return firstForwardedAddress(c.req.header('x-forwarded-for'))
    ?? c.req.header('x-real-ip')?.trim()
    ?? c.req.header('cf-connecting-ip')?.trim()
    ?? 'unknown';
}

function principalHash(c: Context): string {
  const credential = c.req.header('authorization')?.trim()
    ?? c.req.header('x-frankenbeast-operator-token')?.trim()
    ?? `ip:${requestAddress(c)}`;
  return createHash('sha256').update(credential).digest('hex').slice(0, 24);
}

function chatAdmissionKey(c: Context, sessionId: string): string {
  return `session:${sessionId}:principal:${principalHash(c)}`;
}

export function chatRoutes(deps: ChatRoutesDeps): Hono {
  const { sessionStore, runtime, turnRunner, issueSocketToken, operatorToken, streamTicketStore } = deps;
  const app = new Hono();
  const limiter = new InMemoryRateLimiter(deps.chatRateLimit);
  const inFlightMutations = new Set<string>();

  async function withChatMutationAdmission<T>(
    c: Context,
    kind: ChatMutationKind,
    sessionId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const key = chatAdmissionKey(c, sessionId);
    const result = limiter.take(`${kind}:${key}`);
    if (!result.allowed) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }
    if (inFlightMutations.has(key)) {
      throw new HttpError(429, 'RATE_LIMITED', 'Chat mutation already in progress');
    }
    inFlightMutations.add(key);
    try {
      return await run();
    } finally {
      inFlightMutations.delete(key);
    }
  }

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

    return withChatMutationAdmission(c, 'message', session.id, async () => {
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

    return withChatMutationAdmission(c, 'approval', session.id, async () => {
      if (!session.pendingApproval && session.state !== 'pending_approval') {
        return c.json({ data: { id: session.id, approved, state: session.state } });
      }

      let result: Awaited<ReturnType<ChatRuntime['run']>> | null = null;
      if (approved) {
        const pendingApproval = session.pendingApproval ?? null;
        const wasPendingApproval = Boolean(pendingApproval) || session.state === 'pending_approval';
        const runtimeInput = approvalRuntimeInput(pendingApproval);
        const originalState = session.state;
        session.pendingApproval = null;
        session.state = 'approved';
        session.updatedAt = new Date().toISOString();
        sessionStore.save(session);
        try {
          result = await runtime.run(runtimeInput, {
            sessionId: session.id,
            pendingApproval: wasPendingApproval,
            projectId: session.projectId,
            transcript: session.transcript,
            ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
          });
        } catch (error) {
          session.pendingApproval = pendingApproval;
          session.state = originalState;
          session.updatedAt = new Date().toISOString();
          sessionStore.save(session);
          throw error;
        }

        session.state = result.state === 'active' ? 'approved' : result.state;
        session.pendingApproval = null;
        session.beastContext = result.beastContext ?? null;
      } else {
        session.state = 'rejected';
        session.pendingApproval = null;
      }
      session.updatedAt = new Date().toISOString();
      sessionStore.save(session);

      return c.json({
        data: {
          id: session.id,
          approved,
          state: session.state,
          ...(result?.outcome ? { outcome: result.outcome } : {}),
          ...(result?.tier ? { tier: result.tier } : {}),
          ...(result ? { displayMessages: result.displayMessages, events: result.events } : {}),
        },
      } satisfies ApiDataEnvelope<ApproveResult>);
    });
  });

  return app;
}
