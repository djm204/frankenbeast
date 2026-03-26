export type ChannelType = 'slack' | 'discord' | 'telegram' | 'whatsapp';

export interface ChannelInboundMessage {
  channelType: ChannelType;
  externalUserId: string;
  externalChannelId: string;
  externalThreadId?: string | undefined;
  externalMessageId: string;
  text: string;
  rawEvent: unknown;
  receivedAt: string;
}

export type OutboundMessageStatus = 'reply' | 'clarify' | 'plan' | 'execute' | 'progress' | 'approval';

export interface ChannelAction {
  id: string;
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface ProviderMetadata {
  name: string;
  model?: string;
  switchedFrom?: string;
  switchReason?: string;
}

export interface ChannelOutboundMessage {
  text: string;
  status?: OutboundMessageStatus;
  actions?: ChannelAction[];
  metadata?: Record<string, unknown>;
  delta?: string;
  provider?: ProviderMetadata;
  phase?: string;
}

export interface ChannelCapabilities {
  threads: boolean;
  buttons: boolean;
  slashCommands: boolean;
  richBlocks: boolean;
  fileUpload: boolean;
  markdownFlavor: 'slack' | 'discord' | 'telegram' | 'plain';
}

export interface ChannelAdapter {
  type: ChannelType;
  capabilities: ChannelCapabilities;
  send(sessionId: string, message: ChannelOutboundMessage): Promise<void>;
}
