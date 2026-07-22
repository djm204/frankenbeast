import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { constantTimeTokenEqual } from '../../../src/http/security/constant-time.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';

function signedTokenForExpiry(expiresAt: string, secret: string): string {
  const payload = `session-1.chat:socket.${expiresAt}.nonce`;
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

describe('TransportSecurityService', () => {
  it('uses a digest-backed constant-time token comparator for unequal length tokens', () => {
    expect(constantTimeTokenEqual('operator-token-123', 'operator-token-123')).toBe(true);
    expect(constantTimeTokenEqual('operator-token-123', 'operator-token-12')).toBe(false);
    expect(constantTimeTokenEqual('operator-token-123', '')).toBe(false);
  });

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

  it('issues distinct tokens for the same subject in the same validity window', () => {
    const security = new TransportSecurityService();
    const secret = security.createSecret();

    const first = security.issueSignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      expiresInMs: 60_000,
    });
    const second = security.issueSignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      expiresInMs: 60_000,
    });

    expect(second).not.toBe(first);
    expect(security.verifySignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      token: first,
    })).toBe(true);
    expect(security.verifySignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      token: second,
    })).toBe(true);
  });

  it('rejects signed tokens with invalid expiry metadata', () => {
    const security = new TransportSecurityService();
    const secret = security.createSecret();
    const invalidExpiries = [
      'not-a-number',
      'Infinity',
      '-1',
      `${Date.now() + 60_000}.5`,
      `${Date.now() + 60_000}5e-1`,
      String(Number.MAX_SAFE_INTEGER + 1),
    ];

    for (const expiresAt of invalidExpiries) {
      expect(security.verifySignedToken({
        secret,
        scope: 'chat:socket',
        subject: 'session-1',
        token: signedTokenForExpiry(expiresAt, secret),
      }), expiresAt).toBe(false);
    }
  });

  it('rejects tokens with extra dot-separated segments', () => {
    const security = new TransportSecurityService();
    const secret = security.createSecret();
    const token = security.issueSignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
    });

    expect(security.verifySignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      token: `${token}.replay`,
    })).toBe(false);
  });

  it('rejects non-canonical base64url token encodings', () => {
    const security = new TransportSecurityService();
    const secret = security.createSecret();
    const token = security.issueSignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
    });

    expect(security.verifySignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      token: `${token}!`,
    })).toBe(false);

    expect(security.verifySignedToken({
      secret,
      scope: 'chat:socket',
      subject: 'session-1',
      token: token.replace('.', '!.'),
    })).toBe(false);
  });
});
