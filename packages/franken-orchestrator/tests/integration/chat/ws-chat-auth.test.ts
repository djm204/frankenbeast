import { describe, expect, it } from 'vitest';
import {
  CHAT_SOCKET_TOKEN_TTL_MS,
  createSessionTokenSecret,
  issueSessionToken,
  verifyChatSocketRequest,
} from '../../../src/http/ws-chat-auth.js';

describe('websocket chat auth', () => {
  it('requires callers to provide an explicit socket-token TTL', () => {
    expect(() => issueSessionToken({
      secret: createSessionTokenSecret(),
      sessionId: 'sess-1',
    } as Parameters<typeof issueSessionToken>[0])).toThrow(/expiresInMs/);
  });

  it('rejects a connection when the Origin header is not allowlisted', () => {
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({
      expiresInMs: CHAT_SOCKET_TOKEN_TTL_MS,
      secret,
      sessionId: 'sess-1',
    });

    const result = verifyChatSocketRequest({
      allowedOrigins: ['http://localhost:5173'],
      origin: 'https://evil.example',
      sessionId: 'sess-1',
      secret,
      token,
    });

    expect(result.status).toBe(403);
  });

  it('rejects an invalid token', () => {
    const result = verifyChatSocketRequest({
      allowedOrigins: ['http://localhost:5173'],
      origin: 'http://localhost:5173',
      sessionId: 'sess-1',
      secret: createSessionTokenSecret(),
      token: 'bad-token',
    });

    expect(result.status).toBe(401);
  });
});
