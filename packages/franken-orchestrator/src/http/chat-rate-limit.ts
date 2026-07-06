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
  readonly forwardedFor?: string | undefined;
  readonly remoteAddress?: string | undefined;
  readonly socketToken?: string | null | undefined;
}): string {
  const principal = parts.authorization?.trim()
    || parts.socketToken?.trim()
    || firstForwardedFor(parts.forwardedFor)
    || parts.remoteAddress?.trim()
    || 'anonymous';
  return `chat:${parts.action}:${parts.sessionId}:${principal}`;
}

function firstForwardedFor(value: string | undefined): string | undefined {
  return value
    ?.split(',')
    .map((part) => part.trim())
    .find(Boolean);
}
