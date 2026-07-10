import type {
  CommsRuntimePort,
  CommsInboundInput,
  CommsInboundResult,
} from './comms-runtime-port.js';
import { isoNow } from '@franken/types';
import type { OutboundMessageStatus } from './types.js';
import type { ChatRuntime, ChatRuntimeState } from '../../chat/runtime.js';
import type { InMemoryRateLimiter } from '../../beasts/http/beast-rate-limit.js';
import { chatClientKey } from '../../http/chat-rate-limit.js';

export interface CommsSessionStore {
  load(id: string): Promise<CommsSession | null>;
  create(id: string, data: Record<string, unknown>): Promise<CommsSession>;
  save(id: string, data: Record<string, unknown>): Promise<void>;
}

export interface CommsSession {
  sessionId: string;
  projectId: string;
  transcript: Array<{ role: string; content: string; timestamp: string }>;
  state: string;
  beastContext?: unknown;
  routingMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatRuntimeCommsAdapterOptions {
  chatRateLimiter?: InMemoryRateLimiter;
}

function normalizeRoutingMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const normalized = { ...metadata };
  if (normalized.channelId === undefined && typeof metadata.externalChannelId === 'string') {
    normalized.channelId = metadata.externalChannelId;
  }
  if (normalized.threadTs === undefined && typeof metadata.externalThreadId === 'string') {
    normalized.threadTs = metadata.externalThreadId;
  }
  if (normalized.threadId === undefined && typeof metadata.externalThreadId === 'string') {
    normalized.threadId = metadata.externalThreadId;
  }
  return normalized;
}

export class ChatRuntimeCommsAdapter implements CommsRuntimePort {
  constructor(
    private readonly runtime: ChatRuntime,
    private readonly sessionStore: CommsSessionStore,
    private readonly options: ChatRuntimeCommsAdapterOptions = {},
  ) {}

  async processInbound(
    input: CommsInboundInput,
  ): Promise<CommsInboundResult> {
    let session = await this.sessionStore.load(input.sessionId);
    const routingMetadata = normalizeRoutingMetadata(input.metadata ?? session?.routingMetadata);
    const principal = input.externalUserId === 'system'
      ? `${input.channelType}:session:${input.sessionId}`
      : `${input.channelType}:user:${input.externalUserId}`;

    if (this.options.chatRateLimiter && !this.options.chatRateLimiter.take(chatClientKey({
      action: 'message',
      principal,
    })).allowed) {
      return {
        text: 'Rate limit exceeded. Please wait before sending another chat message.',
        status: 'reply',
        ...(routingMetadata ? { metadata: routingMetadata } : {}),
      };
    }

    if (!session) {
      session = await this.sessionStore.create(input.sessionId, {
        channelType: input.channelType,
      });
    }

    // Build runtime state
    const state: ChatRuntimeState = {
      sessionId: input.sessionId,
      pendingApproval: session.state === 'pending_approval',
      projectId: session.projectId,
      transcript: session.transcript as ChatRuntimeState['transcript'],
      beastContext: session.beastContext as ChatRuntimeState['beastContext'],
    };

    // Run through ChatRuntime
    const result = await this.runtime.run(input.text, state);
    const pendingApproval = result.pendingApproval
      ? result.pendingApprovalDescription
        ? {
            description: result.pendingApprovalDescription,
            requestedAt: isoNow(),
            ...result.pendingApprovalContext,
          }
        : session.state === 'pending_approval' ? session.pendingApproval ?? null : null
      : null;

    // Persist updated session
    await this.sessionStore.save(input.sessionId, {
      ...session,
      transcript: result.transcript,
      state: result.state,
      pendingApproval,
      ...(routingMetadata ? { routingMetadata } : {}),
      beastContext: result.beastContext !== undefined ? result.beastContext : session.beastContext,
    });

    // Map to comms outbound format
    const display = result.displayMessages[0];
    const out: CommsInboundResult = {
      text: display?.content ?? '',
    };
    if (display?.kind) {
      out.status = display.kind as OutboundMessageStatus;
    }
    if (routingMetadata) {
      out.metadata = routingMetadata;
    }

    // Add approval buttons when the runtime signals a pending approval
    if (result.pendingApproval) {
      out.status = 'approval';
      out.actions = [
        { id: 'approve', label: 'Approve', style: 'primary' },
        { id: 'reject', label: 'Reject', style: 'danger' },
      ];
    }

    if (result.providerContext) {
      const prov: CommsInboundResult['provider'] = { name: result.providerContext.provider };
      if (result.providerContext.model) prov!.model = result.providerContext.model;
      if (result.providerContext.switchedFrom) prov!.switchedFrom = result.providerContext.switchedFrom;
      if (result.providerContext.switchReason) prov!.switchReason = result.providerContext.switchReason;
      out.provider = prov;
    }
    if (result.phase) {
      out.phase = result.phase;
    }

    return out;
  }
}
