import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { approvalRuntimeInput, UnsafeApprovalCommandError } from '../../chat/approval-input.js';
import { FileApprovalAuditLog, commandSha256, type ApprovalAuditLog } from '../../chat/approval-audit-log.js';
import { BeastDaemonRequestError } from '../../chat/beast-daemon-dispatch-adapter.js';
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
import { isoNow, MAX_CHAT_MESSAGE_CONTENT_LENGTH } from '@franken/types';
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
  content: z.string().min(1).max(MAX_CHAT_MESSAGE_CONTENT_LENGTH),
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
  approvalAuditLog?: ApprovalAuditLog | undefined;
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

function redactPendingApproval(
  pendingApproval: NonNullable<ReturnType<ISessionStore['get']>>['pendingApproval'],
): ChatSessionResponse['pendingApproval'] {
  if (!pendingApproval) return pendingApproval ?? null;
  const redacted = { ...pendingApproval };
  delete redacted.approvalToken;
  delete redacted.requester;
  delete redacted.workerId;
  delete redacted.workdir;
  return redacted;
}

function sessionResponse(
  session: NonNullable<ReturnType<ISessionStore['get']>>,
): ChatSessionResponse {
  return {
    ...session,
    pendingApproval: redactPendingApproval(session.pendingApproval),
  };
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
  const approvalAuditLog = deps.approvalAuditLog ?? new FileApprovalAuditLog();
  const app = new Hono();
  const admission = deps.chatMutationAdmission ?? new ChatMutationAdmission(deps.chatRateLimiter);

  async function withChatMutationAdmission<T>(
    c: Context,
    sessionId: string,
    run: (session: NonNullable<ReturnType<ISessionStore['get']>>) => Promise<T>,
  ): Promise<T> {
    if (!admission.takeRateLimit(chatClientKey({
      action: 'message',
      operatorToken,
      remoteAddress: requestAddress(c),
    }))) {
      throw new HttpError(429, 'RATE_LIMITED', 'Rate limit exceeded');
    }

    return admission.runExclusive(sessionId, async () => run(getSessionOrThrow(sessionStore, sessionId)));
  }

  function approvalRequester(c: Context): string {
    return requestAddress(c);
  }

  function approvalAuditToken(session: NonNullable<ReturnType<ISessionStore['get']>>, command: string): string {
    if (session.pendingApproval?.approvalToken) return session.pendingApproval.approvalToken;
    return `${session.id}:${session.pendingApproval?.requestedAt ?? 'unknown'}:${commandSha256(command)}`;
  }

  function approvalAuditTokenForPending(
    session: NonNullable<ReturnType<ISessionStore['get']>>,
    pendingApproval: NonNullable<NonNullable<ReturnType<ISessionStore['get']>>['pendingApproval']>,
    command: string,
  ): string {
    return pendingApproval.approvalToken ?? `${session.id}:${pendingApproval.requestedAt}:${commandSha256(command)}`;
  }

  async function hasConsumedApproval(session: NonNullable<ReturnType<ISessionStore['get']>>, command: string): Promise<boolean> {
    const pendingApproval = session.pendingApproval;
    if (!pendingApproval) return false;
    try {
      return await approvalAuditLog.hasConsumedApproval({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditToken(session, command),
        commandHash: commandSha256(command),
      });
    } catch {
      return false;
    }
  }

  async function recordApprovalDecision(
    session: NonNullable<ReturnType<ISessionStore['get']>>,
    decision: 'approved' | 'denied' | 'skipped',
    decisionSource: string,
    options: { command?: string; reason?: string; requester?: string | undefined } = {},
  ): Promise<void> {
    const pendingApproval = session.pendingApproval;
    const command = options.command ?? pendingApproval?.command ?? '/approve';
    try {
      await approvalAuditLog.recordDecision({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditToken(session, command),
        ...(pendingApproval?.workerId ? { workerId: pendingApproval.workerId } : {}),
        ...(pendingApproval?.workdir ? { workdir: pendingApproval.workdir } : {}),
        ...(pendingApproval?.requester ? { requester: pendingApproval.requester } : {}),
        ...(options.requester ? { requester: options.requester } : {}),
        command,
        decision,
        decisionSource,
        ...(options.reason ? { reason: options.reason } : {}),
      });
    } catch {
      // Approval state transitions should not fail because audit persistence is unavailable.
    }
  }

  async function recordApprovalExecution(
    session: NonNullable<ReturnType<ISessionStore['get']>>,
    pendingApproval: NonNullable<NonNullable<ReturnType<ISessionStore['get']>>['pendingApproval']>,
    command: string,
    exitCode: number,
    output: string | undefined,
    requester: string | undefined,
  ): Promise<void> {
    try {
      await approvalAuditLog.recordExecution({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditTokenForPending(session, pendingApproval, command),
        ...(pendingApproval.workerId ? { workerId: pendingApproval.workerId } : {}),
        ...(pendingApproval.workdir ? { workdir: pendingApproval.workdir } : {}),
        ...(pendingApproval.requester ? { requester: pendingApproval.requester } : {}),
        ...(requester ? { requester } : {}),
        command,
        exitCode,
        ...(output !== undefined ? { output } : {}),
      });
    } catch {
      // Approval execution should not fail because audit persistence is unavailable.
    }
  }

  async function recordApprovalReplay(
    session: NonNullable<ReturnType<ISessionStore['get']>>,
    command: string,
    reason: string,
    requester: string | undefined,
  ): Promise<void> {
    const pendingApproval = session.pendingApproval;
    if (!pendingApproval) return;
    try {
      await approvalAuditLog.recordReplay({
        sessionId: session.id,
        projectId: session.projectId,
        token: approvalAuditTokenForPending(session, pendingApproval, command),
        ...(pendingApproval.workerId ? { workerId: pendingApproval.workerId } : {}),
        ...(pendingApproval.workdir ? { workdir: pendingApproval.workdir } : {}),
        ...(pendingApproval.requester ? { requester: pendingApproval.requester } : {}),
        ...(requester ? { requester } : {}),
        command,
        reason,
      });
    } catch {
      // Replay rejection should not fail because audit persistence is unavailable.
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
    if (
      error instanceof BeastDaemonRequestError
      && error.status === 409
      && error.code === 'AGENT_CAPACITY_RESERVED'
    ) {
      throw new HttpError(
        409,
        'AGENT_CAPACITY_RESERVED',
        'Agent capacity is reserved for urgent matching work',
        error.details,
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
    return withChatMutationAdmission(c, id, async (session) => {
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
    return withChatMutationAdmission(c, id, async (session) => {
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
            await recordApprovalDecision(session, 'skipped', 'parser', {
              reason: error.message,
              requester: approvalRequester(c),
            });
            return c.json({
              error: {
                code: 'UNSAFE_APPROVAL_COMMAND',
                message: error.message,
              },
            }, 400);
          }
          throw error;
        }
        if (await hasConsumedApproval(session, runtimeInput)) {
          await recordApprovalReplay(session, runtimeInput, 'approval was already consumed', approvalRequester(c));
          session.pendingApproval = null;
          session.state = 'rejected';
          session.updatedAt = isoNow();
          sessionStore.save(session);
          return c.json({
            error: {
              code: 'APPROVAL_REPLAYED',
              message: 'This approval request was already consumed by a prior execution.',
            },
          }, 409);
        }
        await recordApprovalDecision(session, 'approved', 'human', {
          command: runtimeInput,
          requester: approvalRequester(c),
        });
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
          await recordApprovalExecution(
            session,
            pendingApproval,
            runtimeInput,
            1,
            error instanceof Error ? error.message : String(error),
            approvalRequester(c),
          );
          session.pendingApproval = null;
          session.state = 'failed';
          session.updatedAt = isoNow();
          sessionStore.save(session);
          throwKnownChatRuntimeError(error);
        }

        await recordApprovalExecution(
          session,
          pendingApproval,
          runtimeInput,
          result.state === 'failed' ? 1 : 0,
          result.displayMessages.map((displayMessage) => displayMessage.content).join('\n'),
          approvalRequester(c),
        );
        session.state = result.state === 'active' ? 'approved' : result.state;
        session.pendingApproval = null;
        session.beastContext = result.beastContext ?? null;
      } else {
        await recordApprovalDecision(session, 'denied', 'human', {
          requester: approvalRequester(c),
        });
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
