import { createHash } from 'node:crypto';
import { InMemoryRateLimiter, type BeastRateLimitOptions } from '../beasts/http/beast-rate-limit.js';

export type ChatRateLimitOptions = BeastRateLimitOptions;

export const DEFAULT_CHAT_RATE_LIMIT: ChatRateLimitOptions = {
  windowMs: 60_000,
  max: 30,
};

export function createChatRateLimiter(options: ChatRateLimitOptions = DEFAULT_CHAT_RATE_LIMIT): InMemoryRateLimiter {
  return new InMemoryRateLimiter(options);
}

export function chatClientKey(parts: {
  readonly sessionId: string;
  readonly action: 'message' | 'approval';
  readonly authorization?: string | undefined;
  readonly operatorToken?: string | undefined;
  readonly cookie?: string | undefined;
  readonly remoteAddress?: string | undefined;
  readonly principal?: string | undefined;
}): string {
  const principal = parts.principal?.trim()
    || credentialPrincipal('bearer', parts.authorization)
    || credentialPrincipal('operator', parts.operatorToken)
    || credentialPrincipal('cookie', parts.cookie)
    || addressPrincipal(parts.remoteAddress)
    || 'anonymous';
  return `chat:${parts.action}:${parts.sessionId}:${principal}`;
}

function credentialPrincipal(kind: string, value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? `${kind}:${digest(trimmed)}` : undefined;
}

function addressPrincipal(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? `remote:${trimmed}` : undefined;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
