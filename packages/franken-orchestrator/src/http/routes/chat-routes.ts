import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { approvalRuntimeInput, UnsafeApprovalCommandError } from '../../chat/approval-input.js';
import { isValidChatSessionId, type CorruptChatSessionFile, type ISessionStore } from '../../chat/session-store.js';
import type { ConversationEngine } from '../../chat/conversation-engine.js';
import { ChatRuntime, pendingApprovalRuntimeState } from '../../chat/runtime.js';
import type { TurnRunner } from '../../chat/turn-runner.js';
import type {
  ApiDataEnvelope,
  ApproveResult,
  ApprovalReadinessResult,
  ChatSocketTicketResponse,
  ChatSessionResponse,
  ChatSessionSummary,
  MessageResult,
  TurnOutcome,
} from '@franken/types';
import { isoNow } from '@franken/types';
import { HttpError, parseJsonBody, validateBody } from '../middleware.js';
import { createSseHandler } from '../sse.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import type { InMemoryRateLimiter } from '../../beasts/http/beast-rate-limit.js';
import { CapacityReservationError } from '../../beasts/services/capacity-reservation-policy.js';
import { ChatMutationAdmission, chatClientKey } from '../chat-rate-limit.js';

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
  issueSocketTicket: (sessionId: string) => string;
  operatorToken?: string | undefined;
  streamTicketStore?: SseConnectionTicketStore | undefined;
  chatRateLimiter: InMemoryRateLimiter;
  chatMutationAdmission?: ChatMutationAdmission | undefined;
}

function getSessionOrThrow(store: ISessionStore, id: string) {
  validateChatSessionId(id);
  const session = store.get(id);
  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', `Session '${id}' not found`);
  }
  return session;
}

function validateChatSessionId(id: string): string {
  if (!isValidChatSessionId(id)) {
    throw new HttpError(400, 'INVALID_SESSION_ID', 'Invalid chat session id');
  }
  return id;
}

function sessionResponse(
  session: NonNullable<ReturnType<ISessionStore['get']>>,
): ChatSessionResponse {
  return { ...session };
}

function approvalReadinessResponse(
  session: NonNullable<ReturnType<ISessionStore['get']>>,
): ApprovalReadinessResult {
  if (!session.pendingApproval) {
    return {
      id: session.id,
      ready: false,
      status: 'not_ready',
      state: session.state,
      pendingApproval: false,
      reason: session.state === 'pending_approval'
        ? 'Session is pending approval but no approval metadata is available; reject or recover it before approval-cop can approve.'
        : 'No pending approval exists for this session.',
    };
  }

  try {
    approvalRuntimeInput(session.pendingApproval);
  } catch (error) {
    if (error instanceof UnsafeApprovalCommandError) {
      return {
        id: session.id,
        ready: false,
        status: 'unsafe',
        state: session.state,
        pendingApproval: true,
        reason: error.message,
        requestedAt: session.pendingApproval.requestedAt,
        ...(session.pendingApproval.tool ? { tool: session.pendingApproval.tool } : {}),
        ...(session.pendingApproval.command ? { command: session.pendingApproval.command } : {}),
        ...(session.pendingApproval.risk ? { risk: session.pendingApproval.risk } : {}),
      };
    }
    throw error;
  }

  return {
    id: session.id,
    ready: true,
    status: 'ready',
    state: session.state,
    pendingApproval: true,
    reason: 'Pending approval metadata is present and safe for approval-cop to approve.',
    requestedAt: session.pendingApproval.requestedAt,
    ...(session.pendingApproval.tool ? { tool: session.pendingApproval.tool } : {}),
    ...(session.pendingApproval.command ? { command: session.pendingApproval.command } : {}),
    ...(session.pendingApproval.risk ? { risk: session.pendingApproval.risk } : {}),
  };
}

function firstForwardedAddress(header: string | undefined): string | undefined {
  return header?.split(',')[0]?.trim() || undefined;
}

function requestAddress(c: Context): string {
  return c.req.header('x-frankenbeast-remote-address')?.trim()
    || firstForwardedAddress(c.req.header('x-forwarded-for'))
    || c.req.header('x-real-ip')?.trim()
    || c.req.header('cf-connecting-ip')?.trim()
    || 'unknown';
}


export function chatRoutes(deps: ChatRoutesDeps): Hono {
  const { sessionStore, runtime, turnRunner, issueSocketTicket, operatorToken, streamTicketStore } = deps;
  const app = new Hono();
  const admission = deps.chatMutationAdmission ?? new ChatMutationAdmission(deps.chatRateLimiter);

  async function withChatMutationAdmission<T>(
    c: Context,
    sessionId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!admission.takeRateLimit(chatClientKey({
      action: 'message',
      operatorToken,
      remoteAddress: requestAddress(c),
    }))) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }
    if (!admission.begin(sessionId)) {
      throw new HttpError(429, 'RATE_LIMITED', 'Chat mutation already in progress');
    }
    try {
      return await run();
    } finally {
      admission.end(sessionId);
    }
  }

  function throwKnownChatRuntimeError(error: unknown): never {
    if (error instanceof CapacityReservationError) {
      throw new HttpError(
        409,
        'AGENT_CAPACITY_RESERVED',
        'Agent capacity is reserved for urgent matching work',
        {
          decision: error.decision,
          capacity: error.state,
        },
      );
    }
    throw error;
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
      data: sessionResponse(session),
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
    const corruptSessions = (sessionStore.listCorruptions?.(projectId) ?? []).map(({ id, projectId, reason }) => ({
      id,
      ...(projectId === undefined ? {} : { projectId }),
      reason,
    }));
    return c.json({
      data: { sessions, corruptSessions },
    } satisfies ApiDataEnvelope<{
      sessions: ChatSessionSummary[];
      corruptSessions: Pick<CorruptChatSessionFile, 'id' | 'projectId' | 'reason'>[];
    }>);
  });

  // Get session
  app.get('/v1/chat/sessions/:id', (c) => {
    const id = validateChatSessionId(c.req.param('id'));
    const session = getSessionOrThrow(sessionStore, id);
    return c.json({
      data: sessionResponse(session),
    } satisfies ApiDataEnvelope<ChatSessionResponse>);
  });

  app.post('/v1/chat/sessions/:id/socket-ticket', (c) => {
    const id = validateChatSessionId(c.req.param('id'));
    getSessionOrThrow(sessionStore, id);
    return c.json({
      data: { ticket: issueSocketTicket(id) },
    } satisfies ApiDataEnvelope<ChatSocketTicketResponse>);
  });

  app.get('/v1/chat/sessions/:id/approval/health', (c) => {
    const id = validateChatSessionId(c.req.param('id'));
    const session = getSessionOrThrow(sessionStore, id);
    return c.json({
      data: approvalReadinessResponse(session),
    } satisfies ApiDataEnvelope<ApprovalReadinessResult>);
  });

  // Submit message
  app.post('/v1/chat/sessions/:id/messages', async (c) => {
    const id = validateChatSessionId(c.req.param('id'));
    const body = await parseJsonBody(c);
    const { content, executionMode } = validateBody(SubmitMessageBody, body);
    const session = getSessionOrThrow(sessionStore, id);

    return withChatMutationAdmission(c, session.id, async () => {
      if (session.pendingApproval || session.state === 'pending_approval') {
        return c.json({
          error: {
            code: 'APPROVAL_PENDING',
            message: 'Approval is pending. Resolve the approval request before sending another message.',
          },
        }, 409);
      }

      const result = await runtime.run(content, {
        sessionId: session.id,
        ...pendingApprovalRuntimeState(session.pendingApproval, session.state === 'pending_approval'),
        projectId: session.projectId,
        transcript: session.transcript,
        ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
        ...(executionMode ? { executionMode } : {}),
      }).catch(throwKnownChatRuntimeError);

      session.transcript = result.transcript;
      session.state = result.state;
      session.pendingApproval = result.pendingApproval && result.pendingApprovalDescription
        ? {
            description: result.pendingApprovalDescription,
            requestedAt: result.pendingApprovalRequestedAt ?? isoNow(),
            ...result.pendingApprovalContext,
          }
        : null;
      session.beastContext = result.beastContext ?? null;
      session.updatedAt = isoNow();
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
    const id = validateChatSessionId(c.req.param('id'));
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
    const id = validateChatSessionId(c.req.param('id'));
    const body = await parseJsonBody(c);
    const { approved } = validateBody(ApproveBody, body);
    const session = getSessionOrThrow(sessionStore, id);

    return withChatMutationAdmission(c, session.id, async () => {
      if (!session.pendingApproval) {
        if (session.state === 'approved' || session.state === 'rejected') {
          return c.json({
            data: {
              id: session.id,
              approved: session.state === 'approved',
              state: session.state,
              pendingApproval: null,
            },
          } satisfies ApiDataEnvelope<ApproveResult>);
        }

        if (session.state === 'pending_approval' && !approved) {
          session.state = 'rejected';
          session.pendingApproval = null;
          session.updatedAt = isoNow();
          sessionStore.save(session);

          return c.json({
            data: {
              id: session.id,
              approved,
              state: session.state,
              pendingApproval: session.pendingApproval,
            },
          } satisfies ApiDataEnvelope<ApproveResult>);
        }

        return c.json({
          error: {
            code: 'APPROVAL_NOT_PENDING',
            message: 'No pending approval exists for this session.',
          },
        }, 409);
      }

      let result: Awaited<ReturnType<ChatRuntime['run']>> | null = null;
      if (approved) {
        const pendingApproval = session.pendingApproval;
        let runtimeInput: string;
        try {
          runtimeInput = approvalRuntimeInput(pendingApproval);
        } catch (error) {
          if (error instanceof UnsafeApprovalCommandError) {
            return c.json({
              error: {
                code: 'UNSAFE_APPROVAL_COMMAND',
                message: error.message,
              },
            }, 400);
          }
          throw error;
        }
        const originalState = session.state;
        session.pendingApproval = null;
        session.state = 'approved';
        session.updatedAt = isoNow();
        sessionStore.save(session);
        try {
          result = await runtime.run(runtimeInput, {
            sessionId: session.id,
            pendingApproval: true,
            approvalResolved: true,
            projectId: session.projectId,
            transcript: session.transcript,
            ...(session.beastContext !== undefined ? { beastContext: session.beastContext } : {}),
          });
        } catch (error) {
          session.pendingApproval = pendingApproval;
          session.state = originalState;
          session.updatedAt = isoNow();
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
      session.updatedAt = isoNow();
      sessionStore.save(session);

      return c.json({
        data: {
          id: session.id,
          approved,
          state: session.state,
          pendingApproval: session.pendingApproval,
          ...(result?.outcome ? { outcome: result.outcome } : {}),
          ...(result?.tier ? { tier: result.tier } : {}),
          ...(result ? { displayMessages: result.displayMessages, events: result.events } : {}),
        },
      } satisfies ApiDataEnvelope<ApproveResult>);
    });
  });

  return app;
}
