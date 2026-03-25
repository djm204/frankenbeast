import type {
  CommsRuntimePort,
  CommsInboundInput,
  CommsInboundResult,
} from './comms-runtime-port.js';
import type { OutboundMessageStatus } from './types.js';
import type { ChatRuntime, ChatRuntimeState } from '../../chat/runtime.js';

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
  [key: string]: unknown;
}

export class ChatRuntimeCommsAdapter implements CommsRuntimePort {
  constructor(
    private readonly runtime: ChatRuntime,
    private readonly sessionStore: CommsSessionStore,
  ) {}

  async processInbound(
    input: CommsInboundInput,
  ): Promise<CommsInboundResult> {
    // Load or create session
    let session = await this.sessionStore.load(input.sessionId);
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

    // Persist updated session
    await this.sessionStore.save(input.sessionId, {
      ...session,
      transcript: result.transcript,
      state: result.state,
      beastContext: result.beastContext,
    });

    // Map to comms outbound format
    const display = result.displayMessages[0];
    const out: CommsInboundResult = {
      text: display?.content ?? '',
    };
    if (display?.kind) {
      out.status = display.kind as OutboundMessageStatus;
    }
    if (input.metadata) {
      out.metadata = input.metadata;
    }

    // Add approval buttons when the runtime signals a pending approval
    if (result.pendingApproval) {
      out.status = 'approval';
      out.actions = [
        { id: 'approve', label: 'Approve', style: 'primary' },
        { id: 'reject', label: 'Reject', style: 'danger' },
      ];
    }

    // Provider metadata — ChatRuntimeResult gains providerContext + phase
    // fields in Phase 8 when ProviderRegistry is wired into the runtime.
    // Until then, these will be undefined (adapters handle this gracefully).
    // Provider metadata — ChatRuntimeResult gains providerContext + phase
    // in Phase 8 when ProviderRegistry is wired into the runtime.
    const runtimeResult = result as unknown as Record<string, unknown>;
    const providerContext = runtimeResult['providerContext'] as
      | { provider: string; model?: string; switchedFrom?: string; switchReason?: string }
      | undefined;
    if (providerContext) {
      const prov: CommsInboundResult['provider'] = { name: providerContext.provider };
      if (providerContext.model) prov!.model = providerContext.model;
      if (providerContext.switchedFrom) prov!.switchedFrom = providerContext.switchedFrom;
      if (providerContext.switchReason) prov!.switchReason = providerContext.switchReason;
      out.provider = prov;
    }
    if (typeof runtimeResult['phase'] === 'string') {
      out.phase = runtimeResult['phase'];
    }

    return out;
  }
}
