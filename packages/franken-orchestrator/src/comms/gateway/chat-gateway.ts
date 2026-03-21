import { EventEmitter } from 'node:events';
import { ChatSocketBridge } from '../core/chat-socket-bridge.js';
import { SessionMapper } from '../core/session-mapper.js';
import type { 
  ChannelInboundMessage, 
  ChannelOutboundMessage, 
  ChannelAdapter,
  ChannelType
} from '../core/types.js';

export interface ChatGatewayOptions {
  orchestratorWsUrl: string;
  orchestratorToken?: string | undefined;
}

export class ChatGateway extends EventEmitter {
  private readonly bridges = new Map<string, ChatSocketBridge>();
  private readonly adapters = new Map<ChannelType, ChannelAdapter>();
  private readonly sessionMapper = new SessionMapper();
  private readonly orchestratorWsUrl: string;
  private readonly orchestratorToken?: string | undefined;

  constructor(options: ChatGatewayOptions) {
    super();
    this.orchestratorWsUrl = options.orchestratorWsUrl;
    this.orchestratorToken = options.orchestratorToken;
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

    let bridge = this.bridges.get(sessionId);
    if (!bridge) {
      bridge = new ChatSocketBridge({
        url: this.orchestratorWsUrl,
        sessionId,
        token: this.orchestratorToken,
      });

      bridge.on('assistant.message.delta', (event) => {
        this.relayToChannel(sessionId, message.channelType, {
          text: '',
          delta: event.chunk,
          status: 'reply',
        });
      });

      bridge.on('assistant.message.complete', (event) => {
        this.relayToChannel(sessionId, message.channelType, {
          text: event.content,
          status: 'reply',
        });
      });

      bridge.on('turn.execution.progress', (event) => {
        this.relayToChannel(sessionId, message.channelType, {
          text: (event.data?.summary as string) || 'Executing...',
          status: 'progress',
        });
      });

      bridge.on('turn.approval.requested', (event) => {
        this.relayToChannel(sessionId, message.channelType, {
          text: event.description,
          status: 'approval',
          actions: [
            { id: 'approve', label: 'Approve', style: 'primary' },
            { id: 'reject', label: 'Reject', style: 'danger' },
          ],
        });
      });

      await bridge.connect();
      this.bridges.set(sessionId, bridge);
    }

    await bridge.send(message.text);
  }

  private relayToChannel(sessionId: string, channelType: ChannelType, outbound: ChannelOutboundMessage): void {
    const adapter = this.adapters.get(channelType);
    if (adapter) {
      adapter.send(sessionId, outbound).catch((error) => {
        this.emit('error', new Error(`Failed to send to channel ${channelType}: ${error.message}`));
      });
    }
  }

  async handleAction(channelType: ChannelType, sessionId: string, actionId: string): Promise<void> {
    const bridge = this.bridges.get(sessionId);
    if (!bridge) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (actionId === 'approve') {
      await bridge.respondToApproval(true);
    } else if (actionId === 'reject') {
      await bridge.respondToApproval(false);
    } else {
      throw new Error(`Unknown action: ${actionId}`);
    }
  }

  close(): void {
    for (const bridge of this.bridges.values()) {
      bridge.close();
    }
    this.bridges.clear();
  }
}
