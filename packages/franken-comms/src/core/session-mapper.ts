import { createHash } from 'node:crypto';
import type { ChannelType } from './types.js';

export interface SessionMapping {
  channelType: ChannelType;
  externalUserId: string;
  externalChannelId: string;
  externalThreadId?: string;
}

export class SessionMapper {
  /**
   * Generates a deterministic internal sessionId based on the platform-specific context.
   */
  mapToSessionId(mapping: SessionMapping): string {
    const { channelType, externalUserId, externalChannelId, externalThreadId } = mapping;
    
    // We want a stable ID for the same conversation thread
    // Slack: workspace + channel + thread (or user + channel if no thread)
    // Discord: guild + channel + thread
    // Telegram: chat_id
    // WhatsApp: sender_number
    
    const components = [
      channelType,
      externalChannelId,
      externalThreadId || externalUserId, // Fallback to user if no thread to keep DM continuity
    ].filter(Boolean);

    const rawId = components.join(':');
    return createHash('sha256').update(rawId).digest('hex').slice(0, 32);
  }
}
