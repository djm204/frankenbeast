import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface IssueSignedTokenOptions {
  expiresInMs?: number;
  secret: string;
  scope: string;
  subject: string;
}

export interface VerifySignedTokenOptions {
  secret: string;
  scope: string;
  subject?: string | undefined;
  token: string;
}

export interface VerifySocketRequestOptions {
  allowedOrigins?: string[];
  origin: string | null;
  scope: string;
  secret: string;
  subject: string;
  token: string | null;
}

function encode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signatureFor(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

function timingSafeStringMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export class TransportSecurityService {
  createSecret(): string {
    return randomBytes(32).toString('hex');
  }

  issueSignedToken(options: IssueSignedTokenOptions): string {
    const expiresAt = Date.now() + (options.expiresInMs ?? 5 * 60 * 1000);
    const payload = `${options.subject}.${options.scope}.${expiresAt}`;
    const signature = signatureFor(payload, options.secret).toString('base64url');
    return `${encode(payload)}.${signature}`;
  }

  verifySignedToken(options: VerifySignedTokenOptions): boolean {
    const [encodedPayload, encodedSignature] = options.token.split('.');
    if (!encodedPayload || !encodedSignature) {
      return false;
    }

    const payload = decode(encodedPayload);
    const [subject, scope, expiresAtRaw] = payload.split('.');
    if (scope !== options.scope) {
      return false;
    }
    if (options.subject && subject !== options.subject) {
      return false;
    }

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      return false;
    }

    const expected = signatureFor(payload, options.secret);
    const received = Buffer.from(encodedSignature, 'base64url');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  verifyOperatorToken(providedToken: string | null | undefined, expectedToken: string): boolean {
    if (!providedToken) {
      return false;
    }
    return timingSafeStringMatch(providedToken, expectedToken);
  }

  verifySocketRequest(options: VerifySocketRequestOptions) {
    const allowedOrigins = options.allowedOrigins ?? [];
    if (allowedOrigins.length > 0) {
      if (!options.origin || !allowedOrigins.includes(options.origin)) {
        return { ok: false as const, status: 403 as const };
      }
    }

    if (!options.token || !this.verifySignedToken({
      secret: options.secret,
      scope: options.scope,
      subject: options.subject,
      token: options.token,
    })) {
      return { ok: false as const, status: 401 as const };
    }

    return { ok: true as const };
  }
}
