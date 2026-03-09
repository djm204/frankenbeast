import { describe, expect, it } from 'vitest';
import {
  createSessionTokenSecret,
  issueSessionToken,
  verifyChatSocketRequest,
} from '../../../src/http/ws-chat-auth.js';

describe('websocket chat auth', () => {
  it('rejects a connection when the Origin header is not allowlisted', () => {
    const secret = createSessionTokenSecret();
    const token = issueSessionToken({
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
