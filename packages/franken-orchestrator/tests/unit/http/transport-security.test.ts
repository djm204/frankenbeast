import { describe, expect, it } from 'vitest';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

describe('TransportSecurityService', () => {
  it('allows signed websocket requests without an Origin header', () => {
    const security = new TransportSecurityService();
    const secret = security.createSecret();
    const token = security.issueSignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
    });

    expect(security.verifySocketRequest({
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      origin: null,
      scope: 'chat:socket',
      secret,
      subject: 'session-1',
      token,
    })).toEqual({ ok: true });
  });

  it('rejects websocket requests from disallowed Origin headers', () => {
    const security = new TransportSecurityService();
    const secret = security.createSecret();
    const token = security.issueSignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
    });

    expect(security.verifySocketRequest({
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      origin: 'https://evil.example',
      scope: 'chat:socket',
      secret,
      subject: 'session-1',
      token,
    })).toEqual({ ok: false, status: 403 });
  });
});
