import { EventEmitter } from 'node:events';
import { SessionMapper } from '../core/session-mapper.js';
import type { CommsRuntimePort } from '../core/comms-runtime-port.js';
import type {
  ChannelInboundMessage,
  ChannelOutboundMessage,
  ChannelAdapter,
  ChannelType,
} from '../core/types.js';

export class ChatGateway extends EventEmitter {
  private readonly adapters = new Map<ChannelType, ChannelAdapter>();
  private readonly sessionMapper = new SessionMapper();
  private readonly runtime: CommsRuntimePort;

  constructor(runtime: CommsRuntimePort) {
    super();
    this.runtime = runtime;
  }

  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  async handleInbound(message: ChannelInboundMessage): Promise<void> {
    const sessionId = this.sessionMapper.mapToSessionId({
      channelType: message.channelType,
      externalUserId: message.externalUserId,
      externalChannelId: message.externalChannelId,
      externalThreadId: message.externalThreadId,
    });

    const result = await this.runtime.processInbound({
      sessionId,
      channelType: message.channelType,
      text: message.text,
      externalUserId: message.externalUserId,
      metadata: {
        externalChannelId: message.externalChannelId,
        externalThreadId: message.externalThreadId,
      },
    });

    const outbound: ChannelOutboundMessage = { text: result.text };
    if (result.status) outbound.status = result.status;
    if (result.actions) outbound.actions = result.actions;
    if (result.metadata) outbound.metadata = result.metadata;
    if (result.provider) outbound.provider = result.provider;
    if (result.phase) outbound.phase = result.phase;
    this.relayToChannel(sessionId, message.channelType, outbound);
  }

  async handleAction(
    channelType: ChannelType,
    sessionId: string,
    actionId: string,
  ): Promise<void> {
    const action = actionId === 'approve' ? 'approved' : 'rejected';
    const result = await this.runtime.processInbound({
      sessionId,
      channelType,
      text: `/approve ${action}`,
      externalUserId: 'system',
    });

    const outbound: ChannelOutboundMessage = { text: result.text };
    if (result.status) outbound.status = result.status;
    this.relayToChannel(sessionId, channelType, outbound);
  }

  private relayToChannel(
    sessionId: string,
    channelType: ChannelType,
    outbound: ChannelOutboundMessage,
  ): void {
    const adapter = this.adapters.get(channelType);
    if (adapter) {
      adapter.send(sessionId, outbound).catch((error: Error) => {
        this.emit(
          'error',
          new Error(
            `Failed to send to channel ${channelType}: ${error.message}`,
          ),
        );
      });
    }
  }

  close(): void {
    // No bridges to clean up — in-process calls are stateless
  }
}
