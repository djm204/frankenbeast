import { describe, expect, it } from 'vitest';
import { 
  ClientSocketEventSchema, 
  ServerSocketEventSchema 
} from '@franken/core';

describe('ws chat contracts', () => {
  it('accepts a valid message.send event and rejects unknown fields', () => {
    expect(() =>
      ClientSocketEventSchema.parse({
        type: 'message.send',
        clientMessageId: 'client-1',
        content: 'Fix the failing tests',
      }),
    ).not.toThrow();

    expect(() =>
      ClientSocketEventSchema.parse({
        type: 'message.send',
        clientMessageId: 'client-1',
        content: 'Fix the failing tests',
        injected: true,
      }),
    ).toThrow();
  });

  it('accepts a valid session.ready event', () => {
    expect(() =>
      ServerSocketEventSchema.parse({
        type: 'session.ready',
        sessionId: 'sess-1',
        projectId: 'proj-1',
        transcript: [],
        state: 'active',
        pendingApproval: null,
      }),
    ).not.toThrow();
  });
});
