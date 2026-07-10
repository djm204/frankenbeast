import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { now as deterministicNow } from '@franken/types';
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

function isCanonicalBase64Url(input: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(input)
    && Buffer.from(input, 'base64url').toString('base64url') === input;
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
    const expiresAt = deterministicNow() + (options.expiresInMs ?? 5 * 60 * 1000);
    const nonce = randomBytes(16).toString('base64url');
    const payload = `${options.subject}.${options.scope}.${expiresAt}.${nonce}`;
    const signature = signatureFor(payload, options.secret).toString('base64url');
    return `${encode(payload)}.${signature}`;
  }

  verifySignedToken(options: VerifySignedTokenOptions): boolean {
    const tokenParts = options.token.split('.');
    if (tokenParts.length !== 2) {
      return false;
    }
    const [encodedPayload, encodedSignature] = tokenParts;
    if (!encodedPayload || !encodedSignature) {
      return false;
    }
    if (!isCanonicalBase64Url(encodedPayload) || !isCanonicalBase64Url(encodedSignature)) {
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
    if (!Number.isFinite(expiresAt) || expiresAt < deterministicNow()) {
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
      if (options.origin && !allowedOrigins.includes(options.origin)) {
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
