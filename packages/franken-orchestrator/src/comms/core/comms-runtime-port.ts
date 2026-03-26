import type { ChannelType, OutboundMessageStatus, ChannelAction } from './types.js';

export interface CommsRuntimePort {
  processInbound(input: CommsInboundInput): Promise<CommsInboundResult>;
}

export interface CommsInboundInput {
  sessionId: string;
  channelType: ChannelType;
  text: string;
  externalUserId: string;
  metadata?: Record<string, unknown>;
}

export interface CommsInboundResult {
  text: string;
  status?: OutboundMessageStatus;
  actions?: ChannelAction[];
  metadata?: Record<string, unknown>;
  provider?: {
    name: string;
    model?: string;
    switchedFrom?: string;
    switchReason?: string;
  };
  phase?: string;
}
