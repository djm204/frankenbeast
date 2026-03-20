import { describe, it, expect } from 'vitest';
import { SessionMapper } from '../../../src/comms/core/session-mapper.js';

describe('SessionMapper', () => {
  const mapper = new SessionMapper();

  it('maps the same slack thread to the same sessionId', () => {
    const mapping = {
      channelType: 'slack' as const,
      externalUserId: 'U123',
      externalChannelId: 'C456',
      externalThreadId: 'T789',
    };
    const id1 = mapper.mapToSessionId(mapping);
    const id2 = mapper.mapToSessionId(mapping);
    expect(id1).toBe(id2);
  });

  it('generates different sessionIds for different threads in the same channel', () => {
    const id1 = mapper.mapToSessionId({
      channelType: 'slack' as const,
      externalUserId: 'U123',
      externalChannelId: 'C456',
      externalThreadId: 'T1',
    });
    const id2 = mapper.mapToSessionId({
      channelType: 'slack' as const,
      externalUserId: 'U123',
      externalChannelId: 'C456',
      externalThreadId: 'T2',
    });
    expect(id1).not.toBe(id2);
  });

  it('falls back to userId if no threadId provided (DM behavior)', () => {
    const id1 = mapper.mapToSessionId({
      channelType: 'telegram' as const,
      externalUserId: 'user1',
      externalChannelId: 'dm_channel',
    });
    const id2 = mapper.mapToSessionId({
      channelType: 'telegram' as const,
      externalUserId: 'user2',
      externalChannelId: 'dm_channel',
    });
    expect(id1).not.toBe(id2);
  });
});
